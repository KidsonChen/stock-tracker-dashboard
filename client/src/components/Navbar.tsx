import { Link, useLocation } from "wouter";
import { LineChart, BarChart3, MessagesSquare, Newspaper } from "lucide-react";

const NAV = [
  { path: "/", label: "個股追蹤", icon: LineChart },
  { path: "/industry", label: "產業分析", icon: BarChart3 },
  { path: "/news", label: "消息面", icon: Newspaper },
  { path: "/macro", label: "宏觀儀表板", icon: MessagesSquare },
];

export function Navbar() {
  const [location] = useLocation();
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-4 flex items-center gap-2 shrink-0">
          <span className="text-base font-bold neon-glow">股市追蹤儀表板</span>
        </Link>
        <div className="flex items-center gap-1">
          {NAV.map(({ path, label, icon: Icon }) => {
            const active = location === path;
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
