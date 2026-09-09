function Seccion({ titulo }: { titulo: string }) {
  return (
    <section className="p-8">
      <h2 className="font-serif text-2xl text-navy">{titulo}</h2>
    </section>
  );
}

export default Seccion;
