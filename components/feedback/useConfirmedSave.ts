import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { useAppData } from '@/context/app-data-context';

/** Separates local mutation, server acknowledgement and visual confirmation. */
export function useConfirmedSave(visible: boolean) {
  const { confirmWorkspaceSave } = useAppData();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const mutated = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    locked.current = false;
    mutated.current = false;
    setSaving(false);
    setSuccess(false);
    setPending(false);
    setError('');
    return () => { generation.current += 1; };
  }, [visible]);

  const run = async (mutate: () => boolean) => {
    if (!visible || locked.current) return;
    locked.current = true;
    const attempt = generation.current;
    let confirmed = false;
    try {
      if (!mutated.current) {
        if (!mutate()) return;
        mutated.current = true;
        setPending(true);
      }
      Keyboard.dismiss();
      setError('');
      setSaving(true);
      await confirmWorkspaceSave();
      if (attempt !== generation.current) return;
      confirmed = true;
      setSuccess(true);
      // Keep the synchronous submission lock until this presentation closes.
    } catch (failure) {
      if (attempt !== generation.current) return;
      // The workspace rejects with a message already written for the person saving.
      setError(failure instanceof Error ? failure.message : 'Could not save changes.');
    } finally {
      if (attempt === generation.current) {
        setSaving(false);
        // A successful attempt stays locked; failures retry persistence, never the mutation.
        // State isn't read here because React may not have committed it yet.
        locked.current = confirmed;
      }
    }
  };

  return { saving, success, pending, error, run: (mutate: () => boolean) => { if (!success) void run(mutate); } };
}
