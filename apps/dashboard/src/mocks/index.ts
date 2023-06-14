async function initMocks() {
  if (typeof window === "undefined") {
    const { enableApiMocking } = await import("./server");
    enableApiMocking();
  } else {
    const { worker } = await import("./browser");
    worker.start();
  }
}

initMocks();

export {};
