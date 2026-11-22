"""Copy existing test/demo captures; anonymize the native tail label only."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import shutil
ROOT=Path(__file__).resolve().parent;REPO=ROOT.parents[2]
ARCHIVE=Path.home()/'.codex/outputs/mytaillog-store-screenshots-2026-11-21'
for name,source in [('web-map','v2-map'),('web-review','v2-review'),('web-status','v2-status')]:shutil.copyfile(REPO/f'apps/web/src/screenshots/{source}.png',ROOT/f'source/{name}.png')
for name,path,box in [
 ('ios-map','AppStore/iPhone-medium/01-logbook-map.png',(42,248,220,302)),
 ('android-pages','GooglePlay/phone/01-logbook-pages.jpg',None),
 ('duo-cover','AppStore/iPhone-Duo-cover/01-logbook-map.jpg',(40,70,230,122)),
]:
 im=Image.open(ARCHIVE/path).convert('RGB')
 if box:
  d=ImageDraw.Draw(im);col=im.getpixel((box[0],box[1]));d.rectangle(box,fill=col)
  f=ImageFont.truetype(str(REPO/'apps/web/src/app/fonts/LibreFranklin.ttf'),int((box[3]-box[1])*.68));d.text((box[0],box[1]+5),'DEMO',font=f,fill='#17191e' if name!='duo-inner' else '#f2f1ec')
 im.save(ROOT/f'source/{name}.png')

# This genuine selected-page capture is local evidence, never distributed unredacted.
selected=Path.home()/'.local/share/mytaillog-screens/duo-map-selected.png'
if selected.exists():
 from PIL import ImageFilter
 im=Image.open(selected).convert('RGB');d=ImageDraw.Draw(im)
 f=ImageFont.truetype(str(REPO/'apps/web/src/app/fonts/LibreFranklin.ttf'),39);f.set_variation_by_name('SemiBold')
 d.rectangle((10,96,238,150),fill='#17191e');d.text((27,99),'DEMO',font=f,fill='#f2f1ec')
 d.rectangle((1500,475,1667,531),fill='#24272e');d.text((1508,480),'A&P',font=f,fill='#a9adb6')
 box=(1750,700,2490,1710);im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(18)),box)
 d=ImageDraw.Draw(im);d.rectangle((1530,1825,2760,1900),fill='#24272e');d.text((1560,1840),'Source scan obscured for privacy',font=f,fill='#f2f1ec')
 im.save(ROOT/'source/duo-inner.png')
