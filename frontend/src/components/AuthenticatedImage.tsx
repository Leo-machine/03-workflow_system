import { useEffect, useState } from "react";
import { fetchMediaBlobUrl } from "../api/client";

interface Props {
  path: string;
  alt: string;
  className?: string;
  linkClassName?: string;
}

/** 将需要 Bearer 鉴权的媒体转换成短生命周期 blob URL。 */
export default function AuthenticatedImage({ path, alt, className, linkClassName }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetchMediaBlobUrl(path)
      .then((next) => {
        objectUrl = next;
        if (active) setUrl(next);
        else URL.revokeObjectURL(next);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={linkClassName}>
      <img src={url} alt={alt} className={className} />
    </a>
  );
}
