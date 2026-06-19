import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu';

vi.mock('@tauri-apps/plugin-process', () => ({
  exit: vi.fn(),
}));

describe('ContextMenu', () => {
  const handlers = {
    onClose: vi.fn(),
    onSettings: vi.fn(),
    onNewEvent: vi.fn(),
    onToggleDexter: vi.fn(),
    onOpenReminders: vi.fn(),
    onOpenCommandPalette: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
  });

  it('keeps the desktop context menu inside the viewport', () => {
    render(<ContextMenu visible x={310} y={230} {...handlers} />);

    const menu = screen.getByRole('menu');
    expect(Number.parseInt(menu.style.left, 10)).toBeLessThan(310);
    expect(Number.parseInt(menu.style.top, 10)).toBeLessThan(230);
  });

  it('triggers application actions from right click menu items', () => {
    render(<ContextMenu visible x={20} y={20} {...handlers} />);

    fireEvent.click(screen.getByRole('menuitem', { name: /nouvel événement/i }));
    expect(handlers.onNewEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    render(<ContextMenu visible x={20} y={20} {...handlers} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});
