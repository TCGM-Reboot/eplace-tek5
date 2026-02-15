import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

async function bootstrap() {
  const isMock = (import.meta.env.VITE_MOCK as string) === "true";

  if (isMock) {
    const { enableFetchMock } = await import("./mocks/fetchMock");
    const { ensureMockWs } = await import("./mocks/ws");
    const { handleMockDiscordSSO } = await import("./mocks/mockDiscordSSO");

    enableFetchMock();
    ensureMockWs(import.meta.env.VITE_WS_URL as string);
    if (handleMockDiscordSSO()) return;
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
