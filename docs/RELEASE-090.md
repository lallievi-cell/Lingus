# Approdi, barche e isolotti — 0.9.0

Le nuove regioni Casuali aggiungono primi isolotti fisici alla costa e un ciclo di navigazione locale: costruire un approdo, lavorare uno scafo, imbarcare persone e carichi, seguire una rotta in mare e sbarcare su una riva.

## Lavoro e carichi

L’approdo richiede dieci unità di legno e cinque di pietra. La frase **Gruppo · Costruire · Legno · Domani** prepara una struttura sulla riva asciutta con accesso all’acqua.

All’approdo, **Gruppo · Fabbricare · Legno · Qui** prepara la costruzione della barca: quindici unità di legno e un utensile, con venti secondi di lavoro effettivo. Uno scafo interrotto conserva materiali e lavoro già impiegati e può essere ripreso.

L’approdo richiede venti secondi di lavoro produttivo, proporzionati al calendario nelle nuove Guidate. La barca ha tre posti e una stiva da venti unità; i carichi personali contano nel limite di trasporto. Imbarco e sbarco attraversano l’accesso alla riva con movimento reale. Persone e carichi seguono la barca durante il viaggio; fame, freddo e consumo di viveri continuano a esistere. La pausa ferma anche la navigazione.

I comandi contestuali preparano le parole senza eseguire l’ordine né spendere Voce. Dopo la preparazione, scegli la destinazione e premi **Pronuncia**. Caricare per il viaggio usa **Portare · Risorsa · Domani**; scaricare usa **Portare · Risorsa · Qui**. Nessuna operazione accredita a distanza le scorte del campo: servono prelievo, trasporto e consegna.

## Geografia e scala

Gli isolotti, le risorse e gli accessi sono ricavati dal seed originale. Il mare rimane invalicabile a piedi; le barche usano percorsi d’acqua che aggirano la terraferma. Le otto città iniziali e le risorse dell’apertura rimangono sul territorio principale.

La regione resta di un chilometro per lato. Continenti, mari interni e un mondo composto da più regioni sono un’espansione successiva, descritta in [WORLD-SCALE.md](WORLD-SCALE.md).

## Compatibilità

La navigazione locale richiede `mapGeneration.maritimeRules: 1`, insieme alle precedenti regole regionali, dei biomi, dei guadi e della costa. Il metadato appartiene soltanto alle nuove regioni Casuali. I vecchi salvataggi mantengono geografia e regole già giocate; non ricevono isolotti, approdi o barche retroattivamente.

Il catalogo conserva quarantacinque parole e sedici risorse. L’approdo si aggiunge ai venti edifici originali. La barca è un’entità fisica con equipaggio, carico e materiali dello scafo conservati nel salvataggio.

## Prove e scene di interfaccia

Le prove marittime del browser usano il seed `123`, un campo collocato vicino alla costa, un solo adulto e conoscenze preparate in Classica. Costruzione, pagamenti, lavoro, imbarco, navigazione e trasferimenti successivi passano dai controlli pubblici. L’autosalvataggio ordinario conserva gli stati intermedi in pausa; la ricarica riprende una traversata realmente in corso. Gli stati preparati non dimostrano una campagna ordinaria iniziata dai sette fondatori.
