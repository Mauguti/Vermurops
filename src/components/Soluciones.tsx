import React from 'react';
import { Plane, Ship, Truck, Warehouse, FileCheck, MapPin, ArrowRight } from 'lucide-react';

interface ServiceCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  ariaLabel: string;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ icon: Icon, title, description, ariaLabel }) => {
  return (
    <div
      tabIndex={0}
      aria-label={ariaLabel}
      className="group relative flex flex-col justify-between p-8 bg-white rounded-2xl border border-gray-100 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-vermur-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermur-primary focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
    >
      <div>
        {/* Icon Container with transition */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#4B2A8C]/5 text-vermur-primary mb-6 transition-all duration-300 group-hover:bg-vermur-primary group-hover:text-white group-focus:bg-vermur-primary group-focus:text-white">
          <Icon className="w-6 h-6 stroke-[1.5px]" />
        </div>

        {/* Card Title */}
        <h3 className="text-xl font-bold text-vermur-navy tracking-tight mb-3 transition-colors duration-200 group-hover:text-vermur-primary">
          {title}
        </h3>

        {/* Card Description */}
        <p className="text-[14px] text-gray-500 font-sans leading-relaxed mb-6 group-hover:text-gray-700 transition-colors duration-200">
          {description}
        </p>
      </div>

      {/* Action Link with animated chevron */}
      <div className="inline-flex items-center text-sm font-bold text-vermur-accent transition-colors duration-200 hover:text-[#c1321d] cursor-pointer focus:underline">
        <span>Ver más</span>
        <ArrowRight className="w-4 h-4 ml-1 transition-transform duration-300 ease-out group-hover:translate-x-1.5 motion-reduce:group-hover:translate-x-0" />
      </div>
    </div>
  );
};

export default function Soluciones() {
  const servicios = [
    {
      icon: Plane,
      title: 'Carga Aérea',
      description: 'Conexiones rápidas y seguras para carga urgente de alta prioridad o valor, con cobertura global y tiempos de tránsito eficientes.',
      ariaLabel: 'Servicio de carga aérea urgente',
    },
    {
      icon: Ship,
      title: 'Carga Marítima',
      description: 'Servicios integrales FCL y LCL en las rutas globales más competitivas. Conectamos los principales puertos del mundo de forma eficiente.',
      ariaLabel: 'Servicio de carga marítima internacional',
    },
    {
      icon: Truck,
      title: 'Transporte Terrestre',
      description: 'Fletes nacionales y transfronterizos FTL/LTL de puerta a puerta, con monitoreo satelital continuo para la seguridad de tu mercancía.',
      ariaLabel: 'Servicio de transporte terrestre nacional y transfronterizo',
    },
    {
      icon: Warehouse,
      title: 'Almacenaje y WMS',
      description: 'Gestión avanzada de inventarios On-Hand en nuestros centros de distribución estratégica, con visibilidad digital en tiempo real.',
      ariaLabel: 'Servicios de almacenaje y control de inventarios WMS',
    },
    {
      icon: FileCheck,
      title: 'Despacho Aduanal',
      description: 'Despacho ágil en las aduanas clave de México. Nuestros expertos garantizan el estricto cumplimiento normativo y arancelario.',
      ariaLabel: 'Servicios de despacho aduanal y cumplimiento arancelario',
    },
    {
      icon: MapPin,
      title: 'Última Milla',
      description: 'Distribución local coordinada y entrega de precisión directo a tus clientes. Optimizamos cada kilómetro de tu cadena logística.',
      ariaLabel: 'Servicio de distribución de última milla local',
    },
  ];

  return (
    <section 
      id="soluciones" 
      className="w-full bg-gray-50/50 py-24 md:py-32 px-[5%] border-t border-gray-100"
      aria-labelledby="soluciones-heading"
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Section Header */}
        <div className="max-w-[800px] mb-16 md:mb-20">
          {/* Eyebrow */}
          <span className="block text-xs md:text-sm font-bold tracking-[0.2em] text-vermur-primary uppercase mb-4">
            Nuestros Servicios
          </span>

          {/* Display Heading with Accent Word in Serif Italic */}
          <h2 
            id="soluciones-heading"
            className="font-display text-4xl md:text-5xl lg:text-6xl font-black text-vermur-navy tracking-tight leading-[1.1] uppercase mb-6"
          >
            Cada envío tiene su propia <span className="font-serif italic text-vermur-accent font-normal lowercase tracking-normal">historia</span>.
          </h2>

          {/* Humanist Subtitle */}
          <p className="text-base md:text-lg text-gray-500 font-sans font-medium leading-relaxed max-w-[650px]">
            En Vermur, diseñamos soluciones de logística y <i>freight forwarding</i> a la medida de tu cadena de valor. Conectamos tu negocio con el mundo con total transparencia y excelencia operativa.
          </p>
        </div>

        {/* Grid Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {servicios.map((srv, idx) => (
            <ServiceCard
              key={idx}
              icon={srv.icon}
              title={srv.title}
              description={srv.description}
              ariaLabel={srv.ariaLabel}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
