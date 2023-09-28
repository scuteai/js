import { useEffect, useRef, type EffectCallback } from "react";

const useEffectOnce = (effect: EffectCallback) => {
  const hasRunOnce = useRef(false);
  useEffect(() => {
    if (!hasRunOnce.current) {
      const cleanup = effect();
      hasRunOnce.current = true;
      return () => cleanup?.();
    }
  }, []);
};

export default useEffectOnce;
