import { MainLayout } from "@/components/layout/MainLayout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Calendar, User, ArrowRight } from "lucide-react";

export default function Blog() {
  const blogPosts = [
    {
      id: 1,
      title: "Complete Guide to Performing Umrah",
      excerpt: "A step-by-step comprehensive guide to performing Umrah rituals correctly, including Ihram, Tawaf, Sa'i, and Halq/Taqsir.",
      date: "Oct 15, 2024",
      author: "Sheikh Abdullah",
      image: "https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=800&q=80"
    },
    {
      id: 2,
      title: "Hajj 2027: Everything You Need to Know",
      excerpt: "Prepare for your upcoming Hajj journey with our early planning guide. Visas, accommodation, health requirements, and spiritual preparation.",
      date: "Oct 02, 2024",
      author: "Admin",
      image: "https://images.unsplash.com/photo-1590457310574-8848d5696c2e?w=800&q=80"
    },
    {
      id: 3,
      title: "Top Duas for Hajj & Umrah",
      excerpt: "A collection of essential supplications (Duas) to recite during Tawaf, Sa'i, and at Arafat for a complete spiritual experience.",
      date: "Sep 28, 2024",
      author: "Sheikh Mohammed",
      image: "https://images.unsplash.com/photo-1589814400155-2d4e73cc3fb4?w=800&q=80"
    },
    {
      id: 4,
      title: "Iraq Ziyarat: A Spiritual Journey to Karbala",
      excerpt: "Understanding the historical and spiritual significance of visiting Karbala, Najaf, and other holy cities in Iraq.",
      date: "Sep 15, 2024",
      author: "Admin",
      image: "https://images.unsplash.com/photo-1542042161784-26ab9e041e89?w=800&q=80"
    },
    {
      id: 5,
      title: "Visiting Baitul Muqaddas: A Complete Guide",
      excerpt: "Plan your visit to Al-Aqsa Mosque. Learn about the rich Islamic history embedded in the streets of Jerusalem.",
      date: "Aug 30, 2024",
      author: "Tariq Ali",
      image: "https://images.unsplash.com/photo-1549479361-b44cda0b10de?w=800&q=80"
    },
    {
      id: 6,
      title: "Packing Guide for Hajj & Umrah",
      excerpt: "Don't forget the essentials. Our complete checklist of what to pack for your holy journey to Makkah and Madinah.",
      date: "Aug 12, 2024",
      author: "Admin",
      image: "https://images.unsplash.com/photo-1598425237654-4c0536ee07af?w=800&q=80"
    }
  ];

  return (
    <MainLayout>
      <div className="bg-primary pt-24 pb-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 px-4">
          <span className="text-accent uppercase tracking-widest text-sm font-bold mb-4 block">Knowledge & Insights</span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-6">Our Blog</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">Read articles, guides, and spiritual insights to prepare for your sacred journeys.</p>
        </motion.div>
      </div>

      <div className="container mx-auto px-4 py-20 -mt-16 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post, i) => (
            <motion.article 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={post.id} 
              className="bg-white rounded-2xl shadow-xl shadow-black/5 overflow-hidden border border-border/50 group flex flex-col h-full"
            >
              <div className="relative h-60 overflow-hidden">
                <div className="absolute inset-0 bg-primary/20 group-hover:bg-transparent transition-colors duration-500 z-10" />
                <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="p-8 flex flex-col flex-grow">
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1.5"><Calendar size={14} className="text-accent" /> {post.date}</span>
                  <span className="flex items-center gap-1.5"><User size={14} className="text-accent" /> {post.author}</span>
                </div>
                <h2 className="text-2xl font-serif font-bold text-primary mb-4 group-hover:text-accent transition-colors leading-tight">
                  <Link href="#">{post.title}</Link>
                </h2>
                <p className="text-muted-foreground mb-8 line-clamp-3 leading-relaxed">
                  {post.excerpt}
                </p>
                <div className="mt-auto">
                  <Link href="#">
                    <span className="inline-flex items-center text-primary font-semibold group-hover:text-accent transition-colors">
                      Read Full Article <ArrowRight size={16} className="ml-2" />
                    </span>
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
