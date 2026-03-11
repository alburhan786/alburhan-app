import { MainLayout } from "@/components/layout/MainLayout";
import { motion } from "framer-motion";
import { useListPackages } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function Ziyarat() {
  const { data: packages = [] } = useListPackages({ active: true });

  const ziyaratCategories = [
    {
      id: "iraq",
      title: "Iraq Ziyarat",
      subtitle: "Najaf, Karbala, Kazmain, Samarra",
      desc: "Embark on a soul-stirring journey to the holy shrines of Iraq. Our meticulously planned tours offer profound spiritual experiences at the resting places of the revered Imams.",
      image: "https://images.unsplash.com/photo-1542042161784-26ab9e041e89?w=800&q=80",
      filterMatch: ['iraq_ziyarat', 'iraq ziyarat']
    },
    {
      id: "jerusalem",
      title: "Baitul Muqaddas",
      subtitle: "Spiritual Journey to Jerusalem",
      desc: "Visit the third holiest site in Islam. Pray at Al-Aqsa Mosque and explore the rich history of the prophets in the blessed lands of Jerusalem.",
      image: "https://images.unsplash.com/photo-1549479361-b44cda0b10de?w=800&q=80",
      filterMatch: ['baitul_muqaddas', 'baitul muqaddas']
    },
    {
      id: "syria",
      title: "Syria Ziyarat",
      subtitle: "Sacred Shrines in Damascus",
      desc: "Pay your respects at the blessed shrines of Sayyida Zainab (SA) and Sayyida Ruqayya (SA) in the historic and spiritual city of Damascus.",
      image: "https://images.unsplash.com/photo-1588665487467-36e761dfcc41?w=800&q=80",
      filterMatch: ['syria_ziyarat', 'syria ziyarat']
    },
    {
      id: "jordan",
      title: "Jordan Islamic Heritage",
      subtitle: "Historical Sites of the Prophets",
      desc: "Trace the footsteps of the companions and prophets. Visit the Cave of the Seven Sleepers (Ashab al-Kahf) and the battlefields of Mutah.",
      image: "https://images.unsplash.com/photo-1541410965313-d53b3c16ef17?w=800&q=80",
      filterMatch: ['jordan_heritage', 'jordan heritage']
    }
  ];

  return (
    <MainLayout>
      {/* Hero */}
      <div className="bg-primary pt-24 pb-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 px-4">
          <span className="text-accent uppercase tracking-widest text-sm font-bold mb-4 block">Sacred Journeys</span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-6">Ziyarat Tours</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">Connect with Islamic history and elevate your spirituality through our guided tours to the world's most blessed sites.</p>
        </motion.div>
      </div>

      <div className="container mx-auto px-4 py-20">
        <div className="space-y-32">
          {ziyaratCategories.map((category, index) => {
            // Find packages matching this category
            const categoryPackages = packages.filter(p => 
              category.filterMatch.includes(p.type.toLowerCase()) || 
              p.name.toLowerCase().includes(category.title.split(' ')[0].toLowerCase())
            );

            const isEven = index % 2 === 0;

            return (
              <div key={category.id} className="scroll-mt-24" id={category.id}>
                <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 items-center mb-12`}>
                  <div className="lg:w-1/2">
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                      <div className="absolute inset-0 bg-primary/20 mix-blend-multiply z-10" />
                      <img src={category.image} alt={category.title} className="w-full aspect-[4/3] object-cover" />
                    </div>
                  </div>
                  <div className="lg:w-1/2">
                    <h2 className="text-4xl font-serif font-bold text-primary mb-2">{category.title}</h2>
                    <h3 className="text-xl text-accent font-semibold mb-6">{category.subtitle}</h3>
                    <p className="text-muted-foreground text-lg leading-relaxed mb-8">{category.desc}</p>
                    <div className="flex gap-4">
                      <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-8">Inquire Now</Button>
                    </div>
                  </div>
                </div>

                {/* Associated Packages */}
                {categoryPackages.length > 0 ? (
                  <div>
                    <h4 className="text-2xl font-serif font-bold mb-6 text-primary border-b pb-4">Available {category.title} Packages</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {categoryPackages.map(pkg => (
                        <div key={pkg.id} className="bg-white rounded-xl border border-border/50 p-6 shadow-md hover:shadow-lg transition-all flex flex-col">
                          <h5 className="font-serif font-bold text-xl mb-2">{pkg.name}</h5>
                          <div className="flex justify-between text-sm text-muted-foreground mb-4">
                            <span>{pkg.duration}</span>
                            <span className="font-bold text-primary">{formatCurrency(pkg.pricePerPerson)}</span>
                          </div>
                          <Link href={`/packages/${pkg.id}`} className="mt-auto">
                            <Button variant="outline" className="w-full">View Details</Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/30 rounded-xl p-8 text-center border border-dashed border-border">
                    <p className="text-muted-foreground">New packages for {category.title} are being finalized. Please contact us for custom bookings.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}
