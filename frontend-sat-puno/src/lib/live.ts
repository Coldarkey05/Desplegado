import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET, refresh, token } from "./api";
export function useLive(deviceKey?: string, enabled = true) {
  const [state, setState] = useState<"connecting" | "online" | "offline">(
    "connecting",
  );
  const authToken = token();
  useEffect(() => {
    if (!enabled || (!authToken && !deviceKey)) return;
    const socket = io(SOCKET + "/cola", {
      auth: deviceKey ? { deviceKey } : { token: authToken },
      reconnection: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 120);
    };
    socket.on("connect", () => {
      setState("online");
      update();
    });
    socket.on("disconnect", () => setState("offline"));
    socket.on("connect_error", () => setState("offline"));
    socket.on("cola:actualizada", update);
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [authToken, deviceKey, enabled]);
  return state;
}
