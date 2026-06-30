import"./globals.css";import"./builder-fixes.css";import type{Metadata}from"next";import{AuthProvider}from"@/components/Auth";import{Shell}from"@/components/Shell";
export const metadata:Metadata={title:"It4you Track",description:"Acompanhamento de fluxos operacionais",icons:{icon:"/icon.avif",shortcut:"/icon.avif",apple:"/icon.avif"}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body><AuthProvider><Shell>{children}</Shell></AuthProvider></body></html>}
