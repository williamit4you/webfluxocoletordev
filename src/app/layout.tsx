import"./globals.css";import type{Metadata}from"next";import{AuthProvider}from"@/components/Auth";import{Shell}from"@/components/Shell";
export const metadata:Metadata={title:"FlowTrack",description:"Acompanhamento de fluxos operacionais"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body><AuthProvider><Shell>{children}</Shell></AuthProvider></body></html>}
