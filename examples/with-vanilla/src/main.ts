import { Auth, render, updateProps, darkTheme } from "@scute/ui-elements";
import { scute } from "./scute";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<h1>Vanilla App</h1>`;
app.style.margin = "1rem";

const authElement = render(
  Auth,
  {
    scuteClient: scute,
  },
  app,
  "append"
);

scute.onAuthStateChange((event, session, user) => {
  if (event === "signed_in") {
    alert("Signed in!");
  }

  console.info("session:", session, "user: ", user);
});

// or
// const authElement = render(Auth);
// authElement.props = {
//   scuteClient: scute,
// };
// app.appendChild(authElement);

const toggleTheme = document.createElement("button");
toggleTheme.innerText = "Toggle Theme";
toggleTheme.style.marginTop = "1rem";

toggleTheme.onclick = () => {
  const currentTheme = authElement.props.appearance?.theme;

  updateProps(authElement, {
    appearance: {
      theme: currentTheme === undefined ? darkTheme : undefined,
    },
  });

  // or
  // authElement.props.appearance = {
  //   theme: currentTheme === undefined ? darkTheme : undefined,
  // };
};

app.appendChild(toggleTheme);
