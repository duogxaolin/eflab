"use client";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { ManagerPicker as ManagerPickerComponent } from "@/components/build-simulator/ManagerPicker";
import type { Modal as ModalComponent } from "@/components/filters/Modal";

// Code that the player detail page needs only after an interaction, split
// out of the route's first-load JavaScript (efootbase-behaviour-parity, F.2
// bundle budget): the "Select Manager" drawer (ManagerPicker, with the
// shared Modal it is built on) and the phone Progression sheet (Modal).
// Both are modal <dialog>s whose content exists only while open, so nothing
// of them is in the server HTML; their own mount effect does showModal(),
// the initial focus and the focus return, so mounting a moment later (once
// the code is there) changes nothing about how they behave.
//
// - Each one is mounted the first time it is opened and stays mounted
//   afterwards (the slide-out of a closing drawer / sheet needs it).
// - The code is fetched on intent — pointer over, focus on or a press of a
//   control that opens it (`prefetchManagerPicker` / `prefetchModal`) — so a
//   click normally finds it loaded and the dialog opens in the same commit as
//   before; otherwise it opens as soon as the chunk arrives.
// - Not React.lazy / next/dynamic: a lazy component suspends on its first
//   render even when its chunk is already loaded, and React then holds the
//   revealed content back for its Suspense throttle (~300 ms, measured), so a
//   first opening would lag. Here a loaded module renders synchronously.

/** A component whose module is imported on first use; `open` drives it. */
function deferred<M, P extends { open: boolean; onClose: () => void }>(load: () => Promise<M>, pick: (m: M) => ComponentType<P>) {
  let loaded: M | null = null;
  let pending: Promise<M> | null = null;
  const get = (): Promise<M> => {
    pending ??= load().then(
      (m) => (loaded = m),
      (err: unknown) => {
        // Forget the failure, so the next intent or opening tries again.
        pending = null;
        throw err;
      },
    );
    return pending;
  };
  /** Start loading (idempotent; a failure is retried on the next call). */
  const prefetch = (): void => {
    get().catch(() => {});
  };
  function Deferred(props: P) {
    // Opened once = mounted for good (derived during render, like Modal's own
    // `mounted`, so the opening render already has it).
    const [opened, setOpened] = useState(props.open);
    if (props.open && !opened) setOpened(true);
    const [mod, setMod] = useState<M | null>(loaded);
    const ready = mod ?? loaded;
    const onCloseRef = useRef(props.onClose);
    onCloseRef.current = props.onClose;
    // Whether the last opening failed to load the code (announced below). A
    // new opening clears it (derived during render, so it is also cleared
    // when the code arrived meanwhile through a prefetch).
    const [failed, setFailed] = useState(false);
    if (props.open && failed) setFailed(false);
    // Load when asked to open and the code is not there yet. If the chunk
    // cannot be loaded (network), the opening is given up through `onClose`,
    // so the trigger's state is closed again and its next press (a new
    // `open`) retries; the error is logged, not swallowed, and announced in
    // the live region below (a second failure is announced again, since the
    // new opening cleared the message).
    useEffect(() => {
      if (!props.open || ready) return;
      let live = true;
      get().then(
        (m) => {
          if (live) setMod(m);
        },
        (err: unknown) => {
          console.error(err);
          if (!live) return;
          setFailed(true);
          onCloseRef.current();
        },
      );
      return () => {
        live = false;
      };
    }, [props.open, ready]);
    const Component = ready && (opened || props.open) ? pick(ready) : null;
    return (
      <>
        {/* Always rendered (empty until a failure), so the message is
            announced: the dialog it stands for never opened, focus stays on
            the trigger. */}
        <p role="status" aria-live="polite" className="sr-only">
          {failed ? "Could not load — try again." : ""}
        </p>
        {Component ? <Component {...props} /> : null}
      </>
    );
  }
  return { Deferred, prefetch };
}

const managerPicker = deferred(
  () => import("@/components/build-simulator/ManagerPicker"),
  (m) => m.ManagerPicker,
);
const modal = deferred(
  () => import("@/components/filters/Modal"),
  (m) => m.Modal,
);

/** The "Select Manager" drawer, loaded and mounted on its first opening. */
export const DeferredManagerPicker: ComponentType<Parameters<typeof ManagerPickerComponent>[0]> = managerPicker.Deferred;
/** Start loading the manager drawer's code. */
export const prefetchManagerPicker = managerPicker.prefetch;

/** The shared Modal, loaded and mounted on its first opening. */
export const DeferredModal: ComponentType<Parameters<typeof ModalComponent>[0]> = modal.Deferred;
/** Start loading the Modal's code. */
export const prefetchModal = modal.prefetch;
