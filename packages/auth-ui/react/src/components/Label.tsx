import { styled } from '../stitches.config';
import { Text } from './Text';

export const Label = styled('label', Text, {
  display: 'inline-block',
  verticalAlign: 'middle',
  cursor: 'default',
  mb:'$2',
  fontSize:'12px'
});
