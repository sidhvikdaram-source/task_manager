import { createRoot } from "react-dom/client";
import "@fontsource-variable/outfit";
import { configureNimbusApiRuntime } from "@workspace/replit-auth-web";
import App from "./App";
import "./index.css";
import { handleFirebaseApi } from "./lib/firebaseApi";

configureNimbusApiRuntime(handleFirebaseApi);

createRoot(document.getElementById("root")!).render(<App />);
