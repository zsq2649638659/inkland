import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-center bg-paper">
      <div className="max-w-md">
        <p className="text-6xl font-serif font-bold text-accent mb-4">404</p>
        <h1>这里还没有作品</h1>
        <p className="text-muted mb-6">页面可能已被删除，或者链接已经失效。</p>
        <Link href="/" className="btn-accent inline-flex px-5 py-3 rounded-full">回到首页</Link>
      </div>
    </main>
  );
}
