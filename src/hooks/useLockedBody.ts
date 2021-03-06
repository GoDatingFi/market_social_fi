import { useEffect, useState } from "react";

type ReturnType = [boolean, (locked: boolean) => void];

const useLockedBody = (initialLocked = false): ReturnType => {
  const [locked, setLocked] = useState(initialLocked);

  // Do the side effect before render
  useEffect(() => {
    if (!locked) {
      return;
    }

    // Save initial body style
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Get the scrollBar width
    const root = document.getElementById("__next"); // Change it to the id root
    const scrollBarWidth = root ? root.offsetWidth - root.scrollWidth : 0;

    // Lock body scroll
    document.body.style.overflow = "hidden";

    // Avoid width reflow
    if (scrollBarWidth) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;

      if (scrollBarWidth) {
        document.body.style.paddingRight = originalPaddingRight;
      }
    };
  }, [locked]);

  // Update state if initialValue changes
  useEffect(() => {
    if (locked !== initialLocked) {
      setLocked(initialLocked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLocked]);

  return [locked, setLocked];
};

export default useLockedBody;
