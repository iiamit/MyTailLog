"""Camera-led edit of real product captures; preserve the approved audio mix."""
import json,subprocess,shutil
from PIL import Image
from build_media import ROOT,REEL,SOURCE,SCENES,FFMPEG,carousel,music,wrap,text,INK,PAPER,BLUE,YELLOW,TEAL,PURPLE

def run(args):subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error',*args],check=True)
def ass_time(t):
 n=round(t*100);return f'{n//360000:01}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'

COLORS=[INK,YELLOW,PAPER,BLUE,YELLOW,TEAL,INK]

def board(i):
 im=Image.new('RGB',(1080,1920),COLORS[i]);c=INK if i in [1,2,4] else PAPER
 text(im,(64,116),'MyTailLog / SNEAK PEEK',31,c,'ExtraBold')
 text(im,(60,208),SCENES[i][0],82,c,'ExtraBold',1.04)
 text(im,(64,1800),'mytaillog.com',27,c,'SemiBold')
 if i in [3,4]:text(im,(64,1745),'Native apps coming soon · test / simulator preview',23,c)
 if i==6:
  text(im,(64,550),'Free + open source',62,c,'ExtraBold')
  text(im,(64,1370),'mytaillog.com',75,c,'ExtraBold')
  text(im,(64,1475),'Web preview now. Native apps coming soon.',30,c,'SemiBold')
  text(im,(64,1850),'Voice: elevenlabs.io',23,c)
 return im

def camera(duration,bg,z0,z1,x0,x1):
 """A smooth push/pan over a real screen, preserving its aspect ratio."""
 assert duration>0 and min(z0,z1)>=1 and all(0<=x<=1 for x in [x0,x1])
 p=f'min(on/{max(round(duration*30)-1,1)},1)';ease=f'({p})*({p})*(3-2*({p}))'
 z=f'{z0}+({z1-z0})*({ease})'
 x=f'min(max(iw*({x0}+({x1-x0})*({ease}))-iw/zoom/2,0),iw-iw/zoom)'
 return f"scale=2000:-2,pad=2000:2074:0:(oh-ih)/2:color={bg},zoompan=z='{z}':x='{x}':y='ih/2-ih/zoom/2':d=1:s=1080x1120:fps=30,setsar=1"

def edit_scene(i,duration,clips):
 frame=board(i);board_path=clips/f'board-{i}.png';frame.save(board_path)
 inp=['-loop','1','-framerate','30','-i',str(board_path)]
 if i in [0,1,2,5]:
  source={0:'web-map.png',1:'web-map.png',2:'web-review.png',5:'web-status.png'}[i]
  live={1:'web-map-interaction.mp4',5:'web-status-interaction.mp4'}.get(i)
  if live and (SOURCE/live).exists():
   inp+=['-i',str(SOURCE/live)];pad=f'tpad=stop_mode=clone:stop_duration={duration},'
  else:
   inp+=['-loop','1','-framerate','30','-i',str(SOURCE/source)];pad=''
  focus={0:(2.02,2.32,.44,.75),1:(2.02,2.18,.44,.56),2:(2.02,2.32,.46,.75),5:(2.0,2.24,.44,.72)}[i]
  filt=f'[1:v]{pad}{camera(duration,COLORS[i],*focus)}[screen];[0:v][screen]overlay=0:460[v]'
 elif i==3:
  inp+=['-i',str(SOURCE/'native-interaction.mp4'),'-loop','1','-framerate','30','-i',str(SOURCE/'android-pages.png')]
  filt=(f'[1:v]scale=520:-2,tpad=stop_mode=clone:stop_duration={duration}[phone];'
        '[2:v]scale=450:-2[android];'
        "[0:v][phone]overlay=x='26-600*pow(max(0,1-t/0.45),3)':y='440-14*t/6.2'[left];"
        "[left][android]overlay=x='590+600*pow(max(0,1-t/0.6),3)':y='490+12*t/6.2'[v]")
 elif i==4:
  inp+=['-loop','1','-framerate','30','-i',str(SOURCE/'duo-cover.png'),'-loop','1','-framerate','30','-i',str(SOURCE/'duo-inner.png')]
  filt=('[1:v]scale=740:1076,pad=1080:1120:(ow-iw)/2:(oh-ih)/2:color='+YELLOW+',format=rgba,fade=t=out:st=1.5:d=0.35:alpha=1[cover];'
        '[2:v]'+camera(duration,YELLOW,1.5,1.85,.50,.65)+',format=rgba,fade=t=in:st=1.5:d=0.35:alpha=1[inner];'
        '[0:v][cover]overlay=0:460[first];[first][inner]overlay=0:460[v]')
 else:
  filt='';prior='0:v'
  for j,(copy,color) in enumerate([('Google, Apple or email',BLUE),('Your aircraft. Your records.',TEAL),('iPhone · iPad · Android',PURPLE)]):
   strip=Image.new('RGB',(952,110),color);text(strip,(25,34),copy,36,PAPER,'SemiBold');path=clips/f'strip-{j}.png';strip.save(path)
   inp+=['-loop','1','-framerate','30','-i',str(path)]
   start=.12+j*.18
   filt+=f"[{prior}][{j+1}:v]overlay=x='64-1200*pow(max(0,1-(t-{start})/0.5),3)':y={780+j*150}[bar{j}];"
   prior=f'bar{j}'
  filt=filt.rstrip(';').rsplit('[bar2]',1)[0]+'[v]'
 run([*inp,'-filter_complex',filt,'-map','[v]','-t',str(duration),'-r','30','-an','-c:v','libx264','-threads','2','-filter_complex_threads','1','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(clips/f'{i+1:02d}.mp4')])
 run(['-ss',str(duration*.55),'-i',str(clips/f'{i+1:02d}.mp4'),'-frames:v','1',str(REEL/f'keyframe-{i+1:02d}.jpg')])

def main():
 carousel();timing=json.loads((REEL/'timing.json').read_text());total=sum(s['duration'] for s in timing)
 clips=REEL/'clips';clips.mkdir(exist_ok=True)
 for i,s in enumerate(timing):
  edit_scene(i,s['duration'],clips);print('Edited motion scene',i+1,flush=True)
 (REEL/'concat.txt').write_text(''.join(f"file 'clips/{i+1:02d}.mp4'\n" for i in range(len(timing))))
 base=REEL/'picture-master.mp4';run(['-f','concat','-safe','0','-i',str(REEL/'concat.txt'),'-c','copy',str(base)])
 clean=REEL/'mytaillog-platform-update-clean-1080x1920.mp4'
 new_clean=clips/'clean.mp4'
 if clean.exists():
  audio=['-i',str(clean),'-map','0:v','-map','1:a','-c:a','copy']
 else:
  if not (REEL/'original-score.wav').exists():music(total)
  audio=['-i',str(REEL/'voiceover.wav'),'-i',str(REEL/'original-score.wav'),'-filter_complex','[1:a]highpass=f=80[v];[2:a]volume=0.32[m];[v][m]amix=inputs=2:duration=first,loudnorm=I=-16:TP=-1.5:LRA=9[a]','-map','0:v','-map','[a]','-c:a','aac','-b:a','192k','-ar','48000']
 run(['-i',str(base),*audio,'-c:v','copy','-metadata','title=Coming soon: the new MyTailLog | Voice: elevenlabs.io','-movflags','+faststart','-t',str(total),str(new_clean)]);new_clean.replace(clean)
 captions=json.loads((REEL/'captions.json').read_text())
 header='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Libre Franklin,38,&H00ECF1F2,&H00ECF1F2,&H001E1917,&H001E1917,-1,0,0,0,100,100,0,0,3,12,0,2,80,80,304,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
 events=[]
 for c in captions:
  brand=c['text'].replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook');line='\\N'.join(wrap(brand,38,850));events.append(f"Dialogue: 0,{ass_time(c['start'])},{ass_time(c['end'])},Default,,0,0,0,,{line}")
 (REEL/'captions.ass').write_text(header+'\n'.join(events)+'\n')
 from build_media import REPO
 fontdir=str(REPO/'apps/web/src/app/fonts')
 run(['-i',str(clean),'-vf',f"ass={REEL/'captions.ass'}:fontsdir={fontdir}",'-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-metadata','title=Coming soon: the new MyTailLog | Voice: elevenlabs.io','-movflags','+faststart',str(REEL/'mytaillog-platform-update-captioned-1080x1920.mp4')])
 shutil.copyfile(REEL/'keyframe-01.jpg',REEL/'cover-1080x1920.jpg')
 sheet=Image.new('RGB',(1080,960),'#17191e')
 for i in range(7):
  shot=Image.open(REEL/f'keyframe-{i+1:02d}.jpg');shot.thumbnail((270,480));sheet.paste(shot,((i%4)*270,(i//4)*480))
 sheet.save(REEL/'contact-sheet.jpg',quality=94)
 shutil.rmtree(clips)
 base.unlink()
 (REEL/'concat.txt').unlink()
 print('Final edit complete:',total,'seconds',flush=True)
if __name__=='__main__':main()
