// Which presses the markup surface took, for a host that shares the pointer
// with it (quick edit, where the selection itself can be moved): the host
// reacts only to presses the markup left alone.

const taken = new WeakSet<Event>();

/** The markup surface acted on this press (drew, picked, moved, edited...). */
export function markTaken(e: Event): void {
  taken.add(e);
}

export function wasTaken(e: Event): boolean {
  return taken.has(e);
}
