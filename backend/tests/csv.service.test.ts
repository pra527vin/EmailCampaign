import { describe, expect, it } from 'vitest';
import { AppError } from '@mailstrive/shared';
import { parseRecipientCsv } from '../src/services/csv.service.js';

describe('parseRecipientCsv', () => {
  it('imports valid rows and maps the standard columns', () => {
    const csv = [
      'email,first_name,last_name,store_name,store_url',
      'a@example.com,Ada,Lovelace,Ada Goods,https://ada.example.com',
      'b@example.com,Alan,Turing,Turing Supply,https://turing.example.com',
    ].join('\n');

    const { recipients, summary } = parseRecipientCsv(csv);

    expect(summary.totalRows).toBe(2);
    expect(summary.validRecipients).toBe(2);
    expect(recipients[0]).toMatchObject({
      email: 'a@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      storeName: 'Ada Goods',
      // Derived from the name parts.
      name: 'Ada Lovelace',
      rowNumber: 2,
    });
  });

  it('preserves unknown columns as custom fields for personalisation', () => {
    const csv = ['email,name,plan,Monthly Revenue', 'a@example.com,Ada,Pro,12000'].join('\n');

    const { recipients } = parseRecipientCsv(csv);

    expect(recipients[0]?.customFields).toEqual({ plan: 'Pro', monthly_revenue: '12000' });
  });

  it('accepts header aliases and is case-insensitive', () => {
    const csv = ['E-Mail,Full Name,Shop Name', 'a@example.com,Ada Lovelace,Ada Goods'].join('\n');

    const { recipients } = parseRecipientCsv(csv);

    expect(recipients[0]?.email).toBe('a@example.com');
    expect(recipients[0]?.name).toBe('Ada Lovelace');
    expect(recipients[0]?.storeName).toBe('Ada Goods');
  });

  it('rejects invalid addresses without discarding the rest of the file', () => {
    const csv = [
      'email,name',
      'good@example.com,Good',
      'not-an-email,Bad',
      '@example.com,Bad',
      'double..dot@example.com,Bad',
      ',Missing',
    ].join('\n');

    const { recipients, summary } = parseRecipientCsv(csv);

    expect(recipients).toHaveLength(1);
    expect(summary.invalidRecipients).toBe(4);
    expect(summary.errors).toHaveLength(4);
    expect(summary.errors[0]).toMatchObject({ row: 3, reason: 'Invalid email address' });
  });

  it('counts duplicates once and keeps only the first occurrence', () => {
    const csv = [
      'email,name',
      'dup@example.com,First',
      'DUP@example.com,Second',
      '  dup@example.com  ,Third',
    ].join('\n');

    const { recipients, summary } = parseRecipientCsv(csv);

    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.name).toBe('First');
    expect(summary.duplicateRecipients).toBe(2);
  });

  it('normalises addresses to lower case', () => {
    const { recipients } = parseRecipientCsv('email,name\nMixed.Case@Example.COM,Ada');
    expect(recipients[0]?.email).toBe('mixed.case@example.com');
  });

  it('handles quoted fields containing commas and newlines', () => {
    const csv = 'email,company\na@example.com,"Acme, Inc.\nTrading division"';

    const { recipients } = parseRecipientCsv(csv);

    expect(recipients[0]?.company).toBe('Acme, Inc.\nTrading division');
  });

  it('tolerates a UTF-8 byte order mark on the header', () => {
    const { recipients } = parseRecipientCsv('\uFEFFemail,name\na@example.com,Ada');
    expect(recipients).toHaveLength(1);
  });

  it('refuses a file with no email column', () => {
    expect(() => parseRecipientCsv('name,company\nAda,Acme')).toThrowError(AppError);
    expect(() => parseRecipientCsv('name,company\nAda,Acme')).toThrowError(/must contain an "email" column/);
  });

  it('refuses an empty file', () => {
    expect(() => parseRecipientCsv('   ')).toThrowError(/empty/);
  });
});

describe('parseRecipientCsv with an explicit column map', () => {
  const csv = ['Contact,Shop,Tier,Internal Ref', 'a@example.com,Ada Goods,Pro,XY-1'].join('\n');

  it('uses a column the auto-detector would not have recognised as the email', () => {
    const { recipients } = parseRecipientCsv(csv, {
      columnMap: [{ index: 0, header: 'Contact', target: 'email' }],
    });

    expect(recipients[0]?.email).toBe('a@example.com');
  });

  it('renames a column so it can be used as a chosen placeholder', () => {
    const { recipients, summary } = parseRecipientCsv(csv, {
      columnMap: [
        { index: 0, header: 'Contact', target: 'email' },
        { index: 1, header: 'Shop', target: 'storeName' },
        { index: 2, header: 'Tier', target: 'custom', key: 'Plan Tier!' },
        { index: 3, header: 'Internal Ref', target: 'ignore' },
      ],
    });

    expect(recipients[0]?.storeName).toBe('Ada Goods');
    // The key is sanitised into something a template can actually address.
    expect(recipients[0]?.customFields).toEqual({ plan_tier: 'Pro' });
    expect(summary.columns).toEqual(['email', 'store_name', 'plan_tier']);
  });

  it('leaves unmapped columns to auto-detection', () => {
    const partial = ['Contact,first_name', 'a@example.com,Ada'].join('\n');

    const { recipients } = parseRecipientCsv(partial, {
      columnMap: [{ index: 0, header: 'Contact', target: 'email' }],
    });

    expect(recipients[0]?.firstName).toBe('Ada');
  });

  it('re-matches by header name when the column order has shifted', () => {
    const shifted = ['Shop,Contact', 'Ada Goods,a@example.com'].join('\n');

    const { recipients } = parseRecipientCsv(shifted, {
      // Written against the original file, where Contact was column 0.
      columnMap: [{ index: 0, header: 'Contact', target: 'email' }],
    });

    expect(recipients[0]?.email).toBe('a@example.com');
  });

  it('refuses to point two columns at the same field', () => {
    expect(() =>
      parseRecipientCsv(csv, {
        columnMap: [
          { index: 0, header: 'Contact', target: 'email' },
          { index: 1, header: 'Shop', target: 'email' },
        ],
      }),
    ).toThrow(AppError);
  });

  it('never lets a custom column shadow a mapped field', () => {
    const clashing = ['Contact,Shop,Note', 'a@example.com,Ada Goods,hello'].join('\n');

    const { recipients, summary } = parseRecipientCsv(clashing, {
      columnMap: [
        { index: 0, header: 'Contact', target: 'email' },
        { index: 1, header: 'Shop', target: 'storeName' },
        { index: 2, header: 'Note', target: 'custom', key: 'store_name' },
      ],
    });

    expect(recipients[0]?.storeName).toBe('Ada Goods');
    expect(recipients[0]?.customFields).toEqual({ store_name_2: 'hello' });
    expect(summary.columns).toEqual(['email', 'store_name', 'store_name_2']);
  });
});

describe('identity validation', () => {
  it('rejects a file with an email column but no name or merchant column', () => {
    expect(() => parseRecipientCsv('email,signup_date\na@x.com,2026-01-01\n')).toThrow(
      /name or a merchant column/,
    );
  });

  it('accepts a file identified by name', () => {
    expect(parseRecipientCsv('email,name\na@x.com,Ada\n').recipients).toHaveLength(1);
  });

  it('accepts a file identified by merchant', () => {
    const { recipients } = parseRecipientCsv('email,merchant\na@x.com,Acme Ltd\n');
    expect(recipients[0]?.company).toBe('Acme Ltd');
  });

  it('accepts a file identified by store name', () => {
    expect(parseRecipientCsv('email,store_name\na@x.com,Acme Store\n').recipients).toHaveLength(1);
  });

  it('accepts a file identified only by first name', () => {
    const { recipients } = parseRecipientCsv('email,first_name\na@x.com,Ada\n');
    expect(recipients[0]?.name).toBe('Ada');
  });

  it('imports a row that has an address but no label', () => {
    // The file supplies the columns, so the file is usable. A blank name on one
    // row is a blank merge value, not a reason to drop the address.
    const { recipients, summary } = parseRecipientCsv(
      'email,name,merchant\nhas-name@x.com,Ada,\nhas-merchant@x.com,,Acme\nhas-neither@x.com,,\n',
    );
    expect(recipients.map((r) => r.email)).toEqual([
      'has-name@x.com',
      'has-merchant@x.com',
      'has-neither@x.com',
    ]);
    expect(summary.invalidRecipients).toBe(0);
  });

  it('counts only a missing or malformed address as invalid', () => {
    const { summary } = parseRecipientCsv(
      'email,name\n,Ada\nnot-an-email,Bob\nok@x.com,\n',
    );
    expect(summary.invalidRecipients).toBe(2);
    expect(summary.validRecipients).toBe(1);
    expect(summary.errors.map((e) => e.reason)).toEqual([
      'Missing email address',
      'Invalid email address',
    ]);
  });

  it('honours an explicit mapping that supplies the identity column', () => {
    const { recipients } = parseRecipientCsv('email,label\na@x.com,Acme\n', {
      columnMap: [
        { index: 0, header: 'email', target: 'email' },
        { index: 1, header: 'label', target: 'company' },
      ],
    });
    expect(recipients[0]?.company).toBe('Acme');
  });

  it('rejects when the mapping ignores every identity column', () => {
    expect(() =>
      parseRecipientCsv('email,name\na@x.com,Ada\n', {
        columnMap: [
          { index: 0, header: 'email', target: 'email' },
          { index: 1, header: 'name', target: 'ignore' },
        ],
      }),
    ).toThrow(/name or a merchant column/);
  });
});
