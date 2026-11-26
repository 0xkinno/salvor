import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "./styles.css";
import { Layout } from "./ui/Layout";
import Landing from "./pages/Landing";
import Household from "./pages/Household";
import ReceiptPage from "./pages/ReceiptPage";
import Try from "./pages/Try";
import Fleet from "./pages/Fleet";
import Proof from "./pages/Proof";
import How from "./pages/How";
import Judge from "./pages/Judge";

function NotFound() { return <div className="mx-auto max-w-[720px] px-5 py-24"><h1 className="h-display text-[48px]">Nothing here.</h1><p className="mt-3 text-muted">That page does not exist. <a href="/">Back to the start</a>.</p></div>; }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Household />} />
            <Route path="/app/r/:id" element={<ReceiptPage />} />
            <Route path="/try" element={<Try />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/proof" element={<Proof />} />
            <Route path="/how" element={<How />} />
            <Route path="/judge" element={<Judge />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>,
);
