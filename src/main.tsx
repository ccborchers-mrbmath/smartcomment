import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (window.location.hostname === "smartcomment.lovable.app") {
  window.location.replace(
    "https://smartcomment.co.za" + window.location.pathname + window.location.search
  );
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
