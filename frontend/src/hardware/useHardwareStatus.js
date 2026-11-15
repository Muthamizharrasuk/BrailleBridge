import { useCallback, useEffect, useState } from 'react';
import { getHardwareStatus } from './client.js';

export default function useHardwareStatus() {
  const [status, setStatus] = useState({ state: 'checking', connected: false, message: 'Checking Arduino connection…' });
  const check = useCallback(async () => {
    setStatus((current) => ({ ...current, state: 'checking', message: 'Checking Arduino connection…' }));
    try {
      const result = await getHardwareStatus();
      if (result.state === 'connected') setStatus({ ...result, message: `Arduino connected on ${result.port}.` });
      else if (result.state === 'simulation') setStatus({ ...result, message: 'Simulation mode. No serial port is configured.' });
      else setStatus({ ...result, message: result.error || 'Arduino is configured but disconnected.' });
    } catch (error) {
      setStatus({ state: 'disconnected', connected: false, message: `Hardware status unavailable: ${error.message}` });
    }
  }, []);
  useEffect(() => { check(); }, [check]);
  return { status, check, setStatus };
}
