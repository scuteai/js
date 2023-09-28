export default function Home() {
  return (
    <div>
      <ul>
        <li>
          <a href="/app-router">App Router</a>
        </li>
        <li>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/pages-router">Pages Router</a>
        </li>
      </ul>
    </div>
  );
}
