# Sprites

Előre renderelt, felülnézeti sprite-ok (orr / orrfék a +x irányban). Lásd `tools/sprites/` a generálásukhoz.

| Fájl | Tartalom |
| --- | --- |
| `shark.webp`, `koi.webp`, `tang.webp`, `perch.webp` | hal-lapok: 8 farokcsapás-fázis × 3 kanyar-szint (dőlve) + 1 nyugvó kép. A bohóchal 24 fázisú (8 oszlop × 3 sorcsoport / kanyar-szint), a klip saját 1,4 mp-es hurka, kilengés-csillapítás nélkül (`tools/sprites/bake_anim.py`). `koi` = eredeti, `tang` = lila, `perch` = sárga bohóchal (ugyanaz a modell) |
| `shark_bite.webp` | cápa-harapás: 28 kép (7 oszlop), két csattintás („ham, ham”), a cápa oldalra dőlve, hogy a fogak látszanak |
| `ball0.webp`, `ball1.webp` | strandlabda, 16 gördülés-kép egy sorban |
| `ball_shade.webp` | labda fény-/csillogásréteg `[árnyék \| csillogás]` |
| `ring0.webp`, `ring1.webp` | mentőgyűrű (narancs, kék): 6 hengerhüvelyes, fényes szegélyű, fehér csöves háló, a feltöltött render alapján (`tools/sprites/bake_ring.py`) |
| `duck.webp`, `boat.webp` | 16 irányú kép, 8 oszlop × 2 sor. A kacsa a feltöltött `rubber_duck_toy.fbx` koszos, használt textúráival (alapszín, érdesség, normál-térkép) készült (`tools/sprites/bake_duck.py`) |

## Források és jogok

- **Strandlabda** – "Beach Ball (Free Download)", Tommyleenev, [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/) – https://sketchfab.com/3d-models/beach-ball-free-download-c915a99e9bae4dbe8dd7be3215e19ba0 (a hálót és a textúrát felülnézetből renderelve használtuk; a második minta ugyanaz a háló rózsaszín/kék palettával).
- **Cápa** ("Realistic Shark") és **bohóchal** ("Fish_001"): a feltöltött modellek, felülnézetből renderelve; a bohóchal három színváltozata a textúra átszínezésével készült. A modellek licencét ellenőrizd a forrásoldalukon, mielőtt kiadod az appot.
- **Kacsa**: a feltöltött "rubber duck toy" modell és textúrái. **Mentőgyűrű**: a feltöltött render alapján újraépített háló. **Vitorlás**: saját modell. A feltöltött mentőgyűrű- és rózsaszín-kék labda-renderek csak színreferenciák voltak, pixelt nem vettünk át belőlük.
