# Modellek

Valódi 3D hálók (`.prm`) és textúrák; lásd `tools/models/` az előállításukhoz és `src/lib/water/gl/` a rajzolásukhoz.

| Fájl | Tartalom |
| --- | --- |
| `ball.prm`, `ball0/1.webp` | strandlabda (2 minta) |
| `ring.prm`, `ring0/1.webp` | mentőgyűrű (narancs, kék; 4 texeles paletta) |
| `duck.prm`, `duck_base/rough/normal.webp` | gumikacsa (kopott textúra, normal map-pel) |
| `boat.prm`, `boat_wood.webp` | vitorlás |
| `clown.prm`, `koi/tang/perch.webp`, `fish_normal.webp` | bohóchal, 24 képkockás úszás-animáció, 3 színváltozat |
| `alien.prm`, `alien.webp`, `alien_rough.webp`, `alien_normal.webp` | idegen hal (mélytengeri, világító foltokkal), 24 képkockás úszás: a bohóchal gerincmozgását kapta meg (retarget), normal + roughness map |

## Források és jogok

- **Strandlabda** – "Beach Ball (Free Download)", Tommyleenev, [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/) – https://sketchfab.com/3d-models/beach-ball-free-download-c915a99e9bae4dbe8dd7be3215e19ba0 (a második minta ugyanaz a háló rózsaszín/kék palettával).
- **Idegen hal** ("Alien Fish (animated)"), **bohóchal** ("Fish_001") és **gumikacsa** ("rubber_duck_toy"): a feltöltött modellek; a bohóchal három színváltozata a textúra átszínezésével készült, a kacsa a kopott (dirty) textúrával. A licencüket ellenőrizd a forrásoldalukon, mielőtt kiadod az appot.
- **Mentőgyűrű, vitorlás**: saját modell.
