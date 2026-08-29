export function formatCwd(cwd: string | undefined): string {
    if (!cwd) return "";
    const home = cwd.match(/^\/home\/[^/]+/);
    return home ? cwd.replace(home[0], "~") : cwd;
}
