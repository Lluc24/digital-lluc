const blobClassName =
  "absolute animate-drift rounded-full opacity-55 blur-[90px] motion-reduce:animate-none";

export function Background() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      <div
        className={`${blobClassName} top-[-10%] left-[-10%] size-[55vmax] bg-cyan-300 dark:bg-cyan-500`}
      />
      <div
        className={`${blobClassName} top-[20%] right-[-15%] size-[50vmax] bg-violet-300 [animation-delay:-6s] dark:bg-violet-600`}
      />
      <div
        className={`${blobClassName} bottom-[-20%] left-[20%] size-[45vmax] bg-pink-300 [animation-delay:-12s] dark:bg-fuchsia-500`}
      />
    </div>
  );
}
