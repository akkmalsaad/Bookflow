import { useEffect, useState } from 'react';

/** Keep the supplied loader alive while its 420 ms assembled-bird finish plays. */
export function useLoadingTransition(loading: boolean) {
  const [state, setState] = useState({ loading, visible: loading, cycle: 0 });

  // A fresh loading cycle must remount: BookFlowLoading deliberately settles once.
  if (state.loading !== loading) {
    setState({
      loading,
      visible: loading || state.visible,
      cycle: state.cycle + (loading ? 1 : 0),
    });
  }

  useEffect(() => {
    if (loading || !state.visible) return;
    // Leave one frame of room for the completion callback on the UI runtime.
    const timer = setTimeout(() => setState(current => ({ ...current, visible: false })), 450);
    return () => clearTimeout(timer);
  }, [loading, state.visible]);

  return { visible: loading || state.visible, cycle: state.cycle };
}
