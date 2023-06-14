import React from 'react';
import {ScuteAuthContext} from '../ScuteAuthContext';

export const useScute = () => {
  const context = React.useContext(ScuteAuthContext);

  if (!context) {
    throw new Error('useScute must be used within a ScuteAuthContext provider');
  }

  return context;
};