export { FlyweightIterator };

/*
FlyweightIterator — visits a flyweight array's items as a generator, not an array

Visiting order as a generator, not an array: a large dump need never
   materialise one index per byte, and the range visited can be narrowed to
   what is actually on screen. */
class FlyweightIterator {
  constructor(order) {
    this.gen = order[Symbol.iterator]();
    this.current = -1;
  }

  next(subtree) {
    const step = this.gen.next();
    if (step.done) return null;
    this.current = step.value;
    return subtree[0];
  }
}
