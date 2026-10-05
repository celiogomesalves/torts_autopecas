import { useEffect, useRef } from "react";

let _observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!_observer) {
    _observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate");
            _observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    );
  }
  return _observer;
}

/**
 * Imperatively initializes scroll-reveal for all matching elements.
 * Call after route changes or when new elements are added to the DOM.
 */
export function initScrollReveal(selector = ".animate-on-scroll"): void {
  const observer = getObserver();
  document.querySelectorAll(selector).forEach((el) => {
    // Reset animation for re-init scenarios
    el.classList.remove("animate");
    observer.observe(el);
  });
}

/**
 * React hook that returns a ref to attach to a single element
 * for scroll-reveal animation.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = getObserver();
    observer.observe(el);

    return () => {
      observer.unobserve(el);
    };
  }, []);

  return ref;
}
