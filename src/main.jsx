import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import { FirebaseAuthProvider } from "./FirebaseAuthProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FirebaseAuthProvider>
      <App />
    </FirebaseAuthProvider>
  </StrictMode>
);
