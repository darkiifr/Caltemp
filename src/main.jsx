import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./assets/fonts/vins-sans/vins-sans.css";
import "./App.css";

document.documentElement.dataset.caltempWindow = 'main';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
