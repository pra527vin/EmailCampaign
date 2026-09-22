'use client';

import { useEditor, useNode } from '@craftjs/core';
import { ArrowUp, Move, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * The chrome drawn around whichever block is hovered or selected.
 *
 * craft.js calls this for every node and hands back the block's own element in
 * `render`, so this adds the outline and the floating name tag without the
 * blocks themselves knowing anything about selection.
 *
 * The tag is portalled out to the canvas container and positioned from the
 * block's bounding box, because a tag rendered inside the block would be
 * clipped by the email's own `overflow: hidden` and would land inside the
 * exported markup's DOM while editing.
 */
export function RenderNode({ render }: { render: ReactNode }) {
  const { id } = useNode();
  const { actions, query, isActive } = useEditor((_, editorQuery) => ({
    isActive: editorQuery.getEvent('selected').contains(id),
  }));

  const {
    isHover,
    dom,
    name,
    moveable,
    deletable,
    connectors: { drag },
    parent,
  } = useNode((node) => ({
    isHover: node.events.hovered,
    dom: node.dom,
    name: node.data.custom.displayName || node.data.displayName,
    moveable: query.node(node.id).isDraggable(),
    deletable: query.node(node.id).isDeletable(),
    parent: node.data.parent,
  }));

  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dom) return;
    if (isActive || isHover) {
      dom.classList.add(isActive ? 'craft-node-selected' : 'craft-node-hover');
    } else {
      dom.classList.remove('craft-node-selected', 'craft-node-hover');
    }
  }, [dom, isActive, isHover]);

  // A block scrolled past the top of the canvas would put its tag off-screen,
  // so the tag falls back to the block's bottom edge.
  const getPos = useCallback((el: HTMLElement | null) => {
    const { top, left, bottom } = el
      ? el.getBoundingClientRect()
      : { top: 0, left: 0, bottom: 0 };
    return { top: `${top > 0 ? top : bottom}px`, left: `${left}px` };
  }, []);

  const scroll = useCallback(() => {
    const label = labelRef.current;
    if (!label) return;
    const { top, left } = getPos(dom);
    label.style.top = top;
    label.style.left = left;
  }, [dom, getPos]);

  useEffect(() => {
    const canvas = document.querySelector('.compose-canvas-scroll');
    canvas?.addEventListener('scroll', scroll);
    return () => canvas?.removeEventListener('scroll', scroll);
  }, [scroll]);

  const isRoot = query.node(id).isRoot();

  return (
    <>
      {isActive || isHover
        ? createPortal(
            <div
              ref={labelRef}
              className="craft-node-label"
              style={{ left: getPos(dom).left, top: getPos(dom).top }}
            >
              <span>{name}</span>
              {moveable ? (
                <button
                  ref={(el) => {
                    // craft's connector returns the element it was given, which
                    // React 19 would treat as a ref cleanup function.
                    if (el) drag(el);
                  }}
                  className="cursor-move"
                  title="Drag to move"
                  type="button"
                >
                  <Move size={11} />
                </button>
              ) : null}
              {parent && !isRoot ? (
                <button
                  type="button"
                  title="Select parent"
                  onClick={() => actions.selectNode(parent)}
                  className="hover:opacity-80"
                >
                  <ArrowUp size={11} />
                </button>
              ) : null}
              {deletable ? (
                <button
                  type="button"
                  title="Delete"
                  onClick={() => actions.delete(id)}
                  className="hover:opacity-80"
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
            </div>,
            document.querySelector('.compose-canvas') ?? document.body,
          )
        : null}
      {render}
    </>
  );
}
