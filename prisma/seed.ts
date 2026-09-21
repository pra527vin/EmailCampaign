/**
 * Bootstrap script: creates the first administrator and a starter template.
 *
 * Idempotent -- safe to run against an existing database. It never overwrites
 * an existing user's password, so running it in production cannot reset an
 * account.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} must be set before seeding`);
  }
  return value;
}

async function main(): Promise<void> {
  const email = requireEnv('SEED_ADMIN_EMAIL').trim().toLowerCase();
  const password = requireEnv('SEED_ADMIN_PASSWORD');
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = existing
    ? existing
    : await prisma.user.create({
        data: {
          email,
          name,
          role: 'ADMIN',
          passwordHash: await bcrypt.hash(password, 12),
        },
      });

  console.log(existing ? `Admin already exists: ${email}` : `Created admin user: ${email}`);

  const templateName = 'Merchant announcement';
  const alreadySeeded = await prisma.emailTemplate.findFirst({
    where: { userId: user.id, name: templateName },
  });

  if (!alreadySeeded) {
    const htmlPath = join(process.cwd(), 'examples', 'merchant-announcement.html');
    let htmlContent: string;
    try {
      htmlContent = readFileSync(htmlPath, 'utf8');
    } catch {
      console.warn(`Could not read ${htmlPath}; skipping the example template.`);
      return;
    }

    await prisma.emailTemplate.create({
      data: {
        userId: user.id,
        name: templateName,
        description: 'Example template showing personalisation and the unsubscribe footer.',
        subject: 'A quick update for {{store_name | your store}}',
        htmlContent,
        textContent: '',
        status: 'ACTIVE',
        variables: ['name', 'first_name', 'store_name', 'store_url', 'email'],
      },
    });
    console.log(`Created example template: ${templateName}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
