"""Build the campaign's real-screen carousel and editorial motion reel.

Python dependencies: Pillow, NumPy, imageio-ffmpeg. No secrets are read here.
"""
from pathlib import Path
import wave
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
SOURCE=ROOT/'source'; CAR=ROOT/'carousel'; REEL=ROOT/'reel'
for p in [SOURCE,CAR,REEL,ROOT/'facebook']:p.mkdir(exist_ok=True,parents=True)
INK='#17191e'; PAPER='#f2f1ec'; BLUE='#2a3dbe'; YELLOW='#edbb1b'; TEAL='#0b6b6a'; PURPLE='#6b44b8'
FONT=REPO/'apps/web/src/app/fonts/LibreFranklin.ttf'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FPS=30
SCENES=[
 ('Your aircraft.\nA clearer picture.',"Try the new web design. Native apps coming soon.",6.0,"Your aircraft has a story. Here's a sneak peek at what's next for My Tail Log."),
 ('Every decade.\nOne map.',"Follow airframe, engine, propeller and avionics history.",5.4,"Follow decades of maintenance across every logbook, on one connected map."),
 ('The answer.\nAnd the evidence.',"Review the entry beside its original scanned page.",5.8,"Check what was read, right beside the original page. Your review keeps the records in your hands."),
 ('At your desk.\nAt your aircraft.',"Web, iPhone, iPad and Android. Native app preview.",5.5,"Native iPhone and Android apps are coming soon. Keep aircraft details close, and queue updates offline."),
 ('Small screen.\nBig picture.',"iPhone Duo: cover to inner display. Simulator preview.",5.8,"And on iPhone Duo, move from the cover screen to a spacious view, with records side by side."),
 ('Less digging.\nMore doing.',"Hours, oil, squawks, sharing and pre-buy records.",5.7,"Track hours, oil and squawks. Connect My Flight Book, and share the records that matter."),
 ('Your records.\nYour choice.',"Free and open source. Start at mytaillog.com.",6.3,"Free and open source. Try the new design on the web today. Native apps are coming soon. Explore My Tail Log dot com."),
]

@lru_cache(maxsize=80)
def font(n,weight='Regular'):
 f=ImageFont.truetype(str(FONT),n);f.set_variation_by_name(weight);return f

def text(im,xy,copy,size=42,fill=PAPER,weight='Regular',spacing=1.12):
 d=ImageDraw.Draw(im);x,y=xy;f=font(size,weight)
 for line in copy.split('\n'):
  d.text((x,y),line,font=f,fill=fill,anchor='lt');y+=int(size*spacing)
 return y

def fit(im,path,box,radius=0,contain=True):
 shot=Image.open(SOURCE/path).convert('RGB') if isinstance(path,str) else path.convert('RGB')
 x,y,w,h=map(int,box)
 if contain:
  shot.thumbnail((w,h),Image.Resampling.LANCZOS);x+=(w-shot.width)//2;y+=(h-shot.height)//2
 else:shot=ImageOps.fit(shot,(w,h),Image.Resampling.LANCZOS)
 if radius:
  mask=Image.new('L',shot.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,shot.width,shot.height),radius,fill=255);im.paste(shot,(x,y),mask)
 else:im.paste(shot,(x,y))

def phone(im,path,box):
 x,y,w,h=box
 ImageDraw.Draw(im).rounded_rectangle((x-7,y-7,x+w+7,y+h+7),radius=27,fill='#090a0c')
 fit(im,path,box,21,False)

def footer(im,i,light=False,preview=False):
 c=INK if light else PAPER;d=ImageDraw.Draw(im)
 d.line((64,1226,1016,1226),fill=c,width=1)
 text(im,(64,1252),'mytaillog.com',27,c,'SemiBold')
 text(im,(936,1252),f'{i}/7',25,c)
 if preview:text(im,(64,1190),'Coming soon: native apps · anonymized test data',22,c)

def base(color=INK):
 return Image.new('RGB',(1080,1350),color)

def carousel():
 for i in range(1,8):
  bg=[INK,YELLOW,PAPER,BLUE,YELLOW,TEAL,INK][i-1];im=base(bg);light=i in [2,3,5];c=INK if light else PAPER
  text(im,(64,58),'MyTailLog / SNEAK PEEK',32,c,'ExtraBold')
  title=SCENES[i-1][0]
  text(im,(60,148),title,86,c,'ExtraBold',1.04)
  if i==1:
   text(im,(64,362),'Try the new design on the web.\nNative apps: coming soon.',35,PAPER)
   fit(im,'web-map.png',(60,520,960,510),8)
   text(im,(64,1080),'Find the history. See what is due.',35,PAPER,'SemiBold')
  elif i==2:
   fit(im,'web-map.png',(46,430,988,525),5)
   text(im,(64,1004),'Airframe. Engine. Propeller. Avionics.\nConnected history, one scanned page away.',33,INK)
  elif i==3:
   text(im,(64,355),'Review AI readings beside the original.\nConfirm the details before they count.',33,INK)
   fit(im,'web-review.png',(44,503,992,526),4)
   text(im,(64,1086),'The paper stays the source of truth.',32,INK,'SemiBold')
  elif i==4:
   phone(im,'ios-map.png',(104,432,340,739));phone(im,'android-pages.png',(605,432,331,739))
   # Keep the complete screen inside the campaign footer.
   text(im,(94,370),'iOS / iPadOS',28,PAPER,'SemiBold');text(im,(595,370),'Android',28,PAPER,'SemiBold')
   # Cover lower frame ends with the footer panel, leaving screens unclipped above it.
   ImageDraw.Draw(im).rectangle((0,1170,1080,1350),fill=BLUE)
  elif i==5:
   text(im,(64,354),'Coming soon: native layouts that unfold with you.',32,INK)
   fit(im,'duo-cover.png',(57,430,325,628),18)
   fit(im,'duo-inner.png',(410,566,620,437),12)
   text(im,(65,1095),'iPhone Duo · simulator preview',29,INK,'SemiBold')
  elif i==6:
   fit(im,'web-status.png',(44,434,992,526),4)
   text(im,(64,1002),'Hours + oil + squawks + sharing\nMyFlightBook sync + pre-buy dossier',34,PAPER,'SemiBold')
  else:
   text(im,(64,370),'Free. Open source.\nYour aircraft records, in your hands.',39,PAPER,'SemiBold')
   for yy,tx,col in [(560,'Google, Apple or email sign-in',BLUE),(690,'Your scans. Your exports.',TEAL),(820,'Web + iOS + Android',PURPLE)]:
    ImageDraw.Draw(im).rectangle((64,yy,1016,yy+99),fill=col);text(im,(88,yy+31),tx,34,PAPER,'SemiBold')
   text(im,(64,1010),'Try the new web design.',46,PAPER,'ExtraBold')
   text(im,(64,1080),'Native apps coming soon.',33,PAPER)
  footer(im,i,light,i in [4,5]);im.save(CAR/f'{i:02d}.jpg',quality=96,subsampling=0)
 contact=Image.new('RGB',(1080,3*450),INK)
 for j,p in enumerate(sorted(CAR.glob('[0-9][0-9].jpg'))):
  shot=Image.open(p);shot.thumbnail((360,450));contact.paste(shot,((j%3)*360,(j//3)*450))
 contact.save(CAR/'contact-sheet.jpg',quality=94)
 # Facebook link artwork uses a current real web map.
 im=Image.new('RGB',(1200,630),INK);text(im,(46,38),'MyTailLog',27,PAPER,'ExtraBold')
 text(im,(42,110),'Your aircraft.\nA clearer picture.',59,PAPER,'ExtraBold')
 text(im,(46,425),'Web now. Native apps coming soon.',26,PAPER)
 text(im,(46,548),'mytaillog.com',29,PAPER,'SemiBold')
 fit(im,'web-map.png',(650,120,516,400),6)
 im.save(ROOT/'facebook/platform-update-1200x630.jpg',quality=96,subsampling=0)

def scene_frame(i,t,duration,caption=None):
 colors=[INK,YELLOW,PAPER,BLUE,YELLOW,TEAL,INK];bg=colors[i];c=INK if i in [1,2,4] else PAPER
 im=Image.new('RGB',(1080,1920),bg)
 text(im,(72,210),'MyTailLog / SNEAK PEEK',32,c,'ExtraBold')
 text(im,(67,300),SCENES[i][0],90,c,'ExtraBold',1.04)
 # restrained motion on the actual screen, masked to its editorial viewport
 ease=1-(1-min(t/.8,1))**3
 lift=int((1-ease)*45)
 if i in [0,1,2,5]:
  path={0:'web-map.png',1:'web-map.png',2:'web-review.png',5:'web-status.png'}[i]
  # Zoom into a genuine screen rather than animate invented interface elements.
  shot=Image.open(SOURCE/path).convert('RGB');scale=1+0.025*t/max(duration,1)
  sw=int(940*scale);sh=int(sw*shot.height/shot.width)
  canvas=Image.new('RGB',(940,670),bg);shot=shot.resize((sw,sh),Image.Resampling.LANCZOS)
  canvas.paste(shot,((940-sw)//2,(670-sh)//2))
  im.paste(canvas,(70,655+lift))
 elif i==3:
  phone(im,'ios-map.png',(100,630+lift,345,750));phone(im,'android-pages.png',(620,650+lift,327,730))
 elif i==4:
  # Screen-scale transition is editorial; this is not a recording of an OS animation.
  if t<2.3:fit(im,'duo-cover.png',(280,620+lift,520,757),22)
  else:fit(im,'duo-inner.png',(58,750,964,678),16)
 else:
  text(im,(72,660),'Free + open source',63,c,'ExtraBold')
  for j,tx in enumerate(['Google, Apple or email','Web, iOS and Android','Your records. Your exports.']):
   d=ImageDraw.Draw(im);yy=820+j*120;d.rectangle((72,yy,1008,yy+84),fill=[BLUE,TEAL,PURPLE][j]);text(im,(96,yy+27),tx,35,PAPER,'SemiBold')
  text(im,(72,1260),'mytaillog.com',68,c,'ExtraBold')
 support=[['Try the new design on the web.','Native apps: coming soon.'],['Decades of history.','One connected map.'],['Read. Review. Confirm.','Keep the original one tap away.'],['Native iOS + Android.','Coming soon.'],['Built for iPhone Duo.','Coming soon · simulator preview.'],['Keep the next step clear.','MyFlightBook + sharing + exports.'],['Try the new web design today.','Native apps coming soon.']][i]
 text(im,(72,1422),'\n'.join(support),36,c,'SemiBold',1.3)
 text(im,(72,1725),'mytaillog.com',26,c,'SemiBold')
 if i==6:text(im,(72,1780),'Voice: elevenlabs.io',24,c)
 if i in [3,4]:text(im,(72,1660),'Coming soon · anonymized test data',22,c)
 if caption:
  d=ImageDraw.Draw(im);lines=wrap(caption,44,850);h=len(lines)*53+34
  d.rounded_rectangle((62,1612-h,1018,1616),12,fill=INK)
  for j,line in enumerate(lines):
   f=font(38,'SemiBold');w=d.textlength(line,font=f);d.text(((1080-w)/2,1630-h+j*50),line,font=f,fill=PAPER,anchor='lt')
 return im

def wrap(s,size,width):
 d=ImageDraw.Draw(Image.new('RGB',(1,1)));f=font(size,'SemiBold');lines=[];cur=''
 for word in s.split():
  test=(cur+' '+word).strip()
  if d.textlength(test,font=f)>width and cur:lines.append(cur);cur=word
  else:cur=test
 if cur:lines.append(cur)
 return lines

def music(duration):
 rate=48000;t=np.arange(int(duration*rate),dtype=np.float64)/rate;v=np.zeros_like(t)
 # Original restrained marimba-style pulse, no licensed sample or borrowed melody.
 notes=[220,329.6276,440,369.9944,246.9417,369.9944,493.8833,329.6276]
 beat=.5
 for j,start in enumerate(np.arange(0,duration,beat)):
  local=t-start;active=(local>=0)&(local<1.5);x=local[active];freq=notes[j%len(notes)]
  v[active]+=.10*np.exp(-4*x)*(np.sin(2*np.pi*freq*x)+.2*np.sin(2*np.pi*freq*2*x))
 v*=np.minimum(t/1.4,1)*np.minimum((duration-t)/2.4,1)
 stereo=np.stack([v,v*.96],axis=1);pcm=(np.clip(stereo,-1,1)*32767).astype('<i2')
 with wave.open(str(REEL/'original-score.wav'),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())


if __name__=='__main__':carousel()
