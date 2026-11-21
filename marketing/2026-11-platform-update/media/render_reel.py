"""Efficient final edit: real native footage, Duo reveal, aligned captions, original score."""
import json,subprocess
from pathlib import Path
from PIL import ImageDraw
from build_media import ROOT,REEL,SOURCE,SCENES,FFMPEG,scene_frame,carousel,music,wrap

def run(args):subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error',*args],check=True)
def ass_time(t):
 n=round(t*100);return f'{n//360000:01}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'

def main():
 carousel();timing=json.loads((REEL/'timing.json').read_text());total=sum(s['duration'] for s in timing);music(total)
 clips=REEL/'clips';clips.mkdir(exist_ok=True)
 for i,s in enumerate(timing):
  duration=s['duration'];frame=scene_frame(i,2,duration)
  if i==6:
   from build_media import text,PAPER
   text(frame,(72,1780),'Voice: elevenlabs.io',24,PAPER)
  frame.save(REEL/f'keyframe-{i+1:02d}.jpg',quality=96,subsampling=0)
  inp=['-loop','1','-framerate','30','-i',str(REEL/f'keyframe-{i+1:02d}.jpg')]
  filt=[]
  if i==3:
   inp+=['-i',str(SOURCE/'native-interaction.mp4')]
   filt=['-filter_complex',f'[1:v]scale=345:750,tpad=stop_mode=clone:stop_duration={duration}[native];[0:v][native]overlay=100:630:shortest=1[v]','-map','[v]']
  elif i==4:
   scene_frame(i,3,duration).save(REEL/'duo-open-keyframe.jpg',quality=96,subsampling=0)
   inp+=['-loop','1','-framerate','30','-i',str(REEL/'duo-open-keyframe.jpg')]
   filt=['-filter_complex','[0:v][1:v]xfade=transition=fade:duration=0.35:offset=2.0[v]','-map','[v]']
  run([*inp,*filt,'-t',str(duration),'-r','30','-an','-c:v','libx264','-threads','2','-filter_complex_threads','1','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(clips/f'{i+1:02d}.mp4')]);print('Edited scene',i+1,flush=True)
 (REEL/'concat.txt').write_text(''.join(f"file 'clips/{i+1:02d}.mp4'\n" for i in range(len(timing))))
 base=REEL/'picture-master.mp4';run(['-f','concat','-safe','0','-i',str(REEL/'concat.txt'),'-c','copy',str(base)])
 clean=REEL/'mytaillog-platform-update-clean-1080x1920.mp4'
 run(['-i',str(base),'-i',str(REEL/'voiceover.wav'),'-i',str(REEL/'original-score.wav'),'-filter_complex','[1:a]highpass=f=80,volume=1.0[v];[2:a]volume=0.32[m];[v][m]amix=inputs=2:duration=first,loudnorm=I=-16:TP=-1.5:LRA=9[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-metadata','title=Coming soon: the new MyTailLog | Voice: elevenlabs.io','-movflags','+faststart','-t',str(total),str(clean)])
 captions=json.loads((REEL/'captions.json').read_text())
 header='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Libre Franklin,38,&H00ECF1F2,&H00ECF1F2,&H001E1917,&H001E1917,-1,0,0,0,100,100,0,0,3,12,0,2,80,80,304,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
 events=[]
 for c in captions:
  brand=c['text'].replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook');line='\\N'.join(wrap(brand,38,850));events.append(f"Dialogue: 0,{ass_time(c['start'])},{ass_time(c['end'])},Default,,0,0,0,,{line}")
 (REEL/'captions.ass').write_text(header+'\n'.join(events)+'\n')
 from build_media import REPO
 fontdir=str(REPO/'apps/web/src/app/fonts')
 run(['-i',str(clean),'-vf',f"ass={REEL/'captions.ass'}:fontsdir={fontdir}",'-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-metadata','title=Coming soon: the new MyTailLog | Voice: elevenlabs.io','-movflags','+faststart',str(REEL/'mytaillog-platform-update-captioned-1080x1920.mp4')])
 scene_frame(0,2,timing[0]['duration']).save(REEL/'cover-1080x1920.jpg',quality=96)
 from PIL import Image
 sheet=Image.new('RGB',(1080,960),'#17191e')
 for i in range(7):
  shot=Image.open(REEL/f'keyframe-{i+1:02d}.jpg');shot.thumbnail((270,480));sheet.paste(shot,((i%4)*270,(i//4)*480))
 sheet.save(REEL/'contact-sheet.jpg',quality=94)
 import shutil
 shutil.rmtree(clips)
 base.unlink()
 (REEL/'concat.txt').unlink()
 print('Final edit complete:',total,'seconds',flush=True)
if __name__=='__main__':main()
