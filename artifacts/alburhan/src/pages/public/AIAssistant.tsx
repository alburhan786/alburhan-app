import { MainLayout } from "@/components/layout/MainLayout";
import { Bot, MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AIAssistant() {
  return (
    <MainLayout>
      <section className="py-20 min-h-[60vh]">
        <div className="container mx-auto px-4 text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-accent/10 flex items-center justify-center">
            <Bot className="w-10 h-10 text-accent" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-primary mb-4">AI Travel Assistant</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8 text-lg">
            Our AI-powered travel assistant will help you plan your spiritual journey, answer your questions about Hajj & Umrah, and guide you through the booking process.
          </p>

          <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-6 py-3 rounded-full text-sm font-medium mb-12">
            <Clock className="w-4 h-4" />
            Coming Soon — We're building something special for you
          </div>

          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-border/50 p-8">
            <div className="space-y-4 mb-6">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-left">
                  Assalamu Alaikum! How can I help you with your pilgrimage journey today?
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                  I want to know about Hajj 2027 packages
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-left">
                  We have several Hajj 2027 packages available including Standard, Premium, and Royal Elite options. Would you like me to show you the details?
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Coming soon..."
                disabled
                className="flex-1 px-4 py-2 rounded-xl border bg-muted/30 text-sm text-muted-foreground"
              />
              <Button disabled size="sm" className="rounded-xl">
                <MessageCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
