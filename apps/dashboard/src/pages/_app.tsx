import '@radix-ui/themes/styles.css';
import '@/styles/globals.scss'
import type { AppProps } from 'next/app'
import { Theme } from '@radix-ui/themes';

export default function App({ Component, pageProps }: AppProps) {
  return ( <Theme accentColor="teal" grayColor="mauve" scaling='110%'><Component {...pageProps} /></Theme>)
}
