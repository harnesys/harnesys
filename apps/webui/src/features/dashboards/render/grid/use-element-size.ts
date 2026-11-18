import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

export interface ElementSize<T extends HTMLElement> {
  ref: RefObject<T | null>;
  width: number;
  height: number;
}

export interface ElementSizeState {
  width: number;
  height: number;
}

/** Content box of one element, observed for width and height. */
export function useElementSize<T extends HTMLElement>(): ElementSize<T> {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSizeState>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}
