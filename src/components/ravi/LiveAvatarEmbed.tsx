export function LiveAvatarEmbed({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      allow="microphone; camera"
      title="LiveAvatar Embed"
      className="h-full w-full border-none rounded-2xl"
    />
  );
}
