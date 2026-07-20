import { cn } from "@/lib/utils";
import { avatarColor, initials } from "@/lib/utils";

export function Avatar({
  firstName,
  lastName,
  src,
  size = 32,
  className,
}: {
  firstName?: string | null;
  lastName?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const label = initials(firstName, lastName);
  const bg = avatarColor(`${firstName}${lastName}`);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        className={cn("rounded-full object-cover ring-2 ring-background", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background", className)}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.4 }}
    >
      {label}
    </span>
  );
}

export function AvatarGroup({
  users,
  max = 3,
  size = 28,
}: {
  users: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u, i) => (
        <Avatar key={i} firstName={u.firstName} lastName={u.lastName} src={u.avatarUrl} size={size} />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-2 ring-background"
          style={{ width: size, height: size, fontSize: size * 0.36 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
