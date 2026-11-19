# PDF fonts

Static instances of the variable fonts in `src/app/fonts` for the server-side PDF renderer (`src/lib/pdf/render.tsx`).
`@react-pdf/renderer` cannot subset a variable font's instance, so each weight is cut once with fontTools:

```
fonttools varLib.instancer src/app/fonts/LibreFranklin.ttf wght=400 --static -o LibreFranklin-400.ttf
fonttools varLib.instancer src/app/fonts/LibreFranklin.ttf wght=600 --static -o LibreFranklin-600.ttf
fonttools varLib.instancer src/app/fonts/Literata.ttf wght=400 opsz=12 --static -o Literata-400.ttf
fonttools varLib.instancer src/app/fonts/JetBrainsMono.ttf wght=400 --static -o JetBrainsMono-400.ttf
```

Licences: the SIL Open Font License files beside them (unchanged from `src/app/fonts`).
