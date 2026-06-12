export default function Home() {
  return (
    <main className="min-h-screen bg-green-950 text-white">
      <section className="text-center py-20 px-6">
        <h1 className="text-5xl font-bold mb-4">SMES Turf</h1>
        <p className="text-xl mb-6">Where Champions Begin</p>

        <div className="bg-yellow-400 text-black inline-block px-6 py-3 rounded-full font-bold mb-8">
          🎉 Launch Offer: ₹1250 / Hour
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <a
            href="https://wa.me/918453095258"
            className="bg-green-600 px-6 py-3 rounded-lg font-semibold"
          >
            WhatsApp Us
          </a>

          <a
            href="https://maps.google.com/?q=12.329329,76.612008"
            className="bg-blue-600 px-6 py-3 rounded-lg font-semibold"
          >
            Get Directions
          </a>
        </div>
      </section>

      <section className="py-12 px-6 text-center">
        <h2 className="text-3xl font-bold mb-8">Sports Available</h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-green-900 p-8 rounded-xl">
            <h3 className="text-2xl font-bold">⚽ Football</h3>
          </div>

          <div className="bg-green-900 p-8 rounded-xl">
            <h3 className="text-2xl font-bold">🏏 Cricket</h3>
          </div>
        </div>
      </section>

      <section className="py-12 px-6 text-center">
        <h2 className="text-3xl font-bold mb-8">Facilities</h2>

        <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div>✅ Floodlights</div>
          <div>✅ Parking</div>
          <div>✅ Washrooms</div>
          <div>✅ Drinking Water</div>
          <div>✅ Open 24 Hours</div>
        </div>
      </section>

      <section className="py-12 px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">Contact Us</h2>

        <p>📞 8453095258</p>
        <p>📧 sports@smesturf.com</p>
        <p>📍 Mysuru, Karnataka</p>
      </section>
    </main>
  );
}