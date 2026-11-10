"use client";

import { createContext } from "react";

/** Estado de envio do ActionForm, lido pelo botão Submit. */
export const PendingContext = createContext<boolean | null>(null);
