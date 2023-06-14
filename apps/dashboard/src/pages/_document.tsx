import { Html, Head, Main, NextScript } from "next/document";
import { getCssText, reset } from "../styles/stitches.config";

const getCssAndReset = () => {
  const css = getCssText();
  reset();
  return css;
};

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style
          id="stitches"
          dangerouslySetInnerHTML={{ __html: getCssAndReset() }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
