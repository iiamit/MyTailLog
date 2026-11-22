"""Assemble supplied Flow motion, real app captures and aligned ElevenLabs narration.
Run with the campaign media venv. Credentials are read only from protected config.
"""
import base64, hashlib, json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
import requests
from build_media import FFMPEG, REEL, REPO, wrap, INK, YELLOW
from render_reel import edit_scene, ass_time
import render_reel as motion_edit
HERE=Path(__file__).resolve().parent
OUT=HERE/'film'; OUT.mkdir(exist_ok=True)
TMP=OUT/'work'; TMP.mkdir(exist_ok=True)
motion_edit.REEL=TMP
FPS=30
# Physical sequence slots retain the generated choreography; product slots follow speech.
SHOTS=[
 ('paper',None,"Every aircraft has a story. But on paper, that story lives in separate logbooks.",8),
 ('aircraft',None,"Airframe. Engine. Propeller. Avionics.",8),
 ('tasks',None,"Different dates. Different tasks. Maintenance, inspections, and ay dee tracking. A lot to keep connected.",8),
 ('connected',None,"My Tail Log brings it all together. Turn scattered pages into a connected view of your aircraft.",8),
 ('review',2,"Scan or upload your logbooks, then review the extracted entries right beside the originals.",7),
 ('history',1,"Follow the history across every book. See what's due, and plan what comes next.",7),
 ('maintenance',5,"Track hours, oil, and squawks. Connect My Flight Book to help keep your records in step.",8),
 ('mobile',3,"At your desk, or at the aircraft. The new native apps are coming soon.",7),
 ('duo',4,"Including layouts that unfold with iPhone Duo, with records side by side.",7),
 ('close',6,"Free and open source. Try the new web design today. Native apps coming soon. My Tail Log dot com.",9),
]

def run(args):
 subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','error','-filter_complex_threads','1',*map(str,args)],check=True)

def config():
 vals={}
 p=Path(os.environ.get('ELEVENLABS_CONFIG',Path.home()/'.config/mytaillog/elevenlabs.env'))
 for line in p.read_text().splitlines():
  if '=' in line:
   k,v=line.strip().removeprefix('export ').split('=',1); vals[k]=v.strip().strip('\"\'')
 key=vals.get('ELEVENLABS_API_KEY') or vals.get('XI_API_KEY')
 if not key:raise RuntimeError('Missing ElevenLabs API key in protected config')
 return key

def narration():
 key=None; offset=0; timeline=[]; captions=[]
 for i,(name,scene,copy,minimum) in enumerate(SHOTS):
  mp3=OUT/f'voice-{i+1:02}.mp3'; ap=OUT/f'alignment-{i+1:02}.json'
  data=json.loads(ap.read_text()) if ap.exists() else {}
  if not mp3.exists() or data.get('_request_text')!=copy:
   if key is None:key=config()
   r=requests.post('https://api.elevenlabs.io/v1/text-to-speech/iP95p4xoKVk53GoZ742B/with-timestamps',params={'output_format':'mp3_44100_128'},headers={'xi-api-key':key},json={'text':copy,'model_id':'eleven_multilingual_v2','voice_settings':{'stability':.45,'similarity_boost':.8,'style':.2,'use_speaker_boost':True,'speed':1.0}},timeout=120)
   if not r.ok:raise RuntimeError(f'ElevenLabs narration request failed: HTTP {r.status_code}; no credential logged')
   data=r.json();mp3.write_bytes(base64.b64decode(data.pop('audio_base64')));data['_request_text']=copy;ap.write_text(json.dumps(data,indent=2))
  a=data.get('normalized_alignment') or data['alignment']; end=a['character_end_times_seconds'][-1]
  duration=round(max(minimum,end+.8)*FPS)/FPS
  if i<4:
   assert end+.45<=8, f'{name} speech exceeds fixed motion slot; revise pacing before render'
   duration=8
  voice=TMP/f'voice-{i}.wav'
  run(['-i',mp3,'-af',f'adelay=250:all=1,apad=whole_dur={duration}','-t',duration,'-ar','48000','-ac','1',voice])
  words=[];buf='';start=0
  for j,ch in enumerate(a['characters']):
   if not buf:start=a['character_start_times_seconds'][j]
   buf+=ch
   if ch.isspace() or j==len(a['characters'])-1:
    if buf.strip():words.append((buf.strip(),start,a['character_end_times_seconds'][j]))
    buf=''
  group=[]
  for word in words:
   group.append(word)
   if len(' '.join(w[0] for w in group))>45 or word[0].endswith(('.', '!', '?')):
    captions.append({'start':offset+.25+group[0][1],'end':offset+.25+group[-1][2],'text':' '.join(w[0] for w in group)});group=[]
  if group:captions.append({'start':offset+.25+group[0][1],'end':offset+.25+group[-1][2],'text':' '.join(w[0] for w in group)})
  timeline.append({'name':name,'scene':scene,'start':offset,'duration':duration,'voice':str(voice)});offset+=duration
  print(f'Narration {name}: {duration:.2f}s',flush=True)
 (TMP/'voices.txt').write_text(''.join(f"file '{s['voice']}'\n" for s in timeline))
 run(['-f','concat','-safe','0','-i',TMP/'voices.txt','-c','copy',OUT/'voiceover.wav'])
 run(['-i',OUT/'voiceover.wav','-codec:a','libmp3lame','-q:a','2',OUT/'voiceover.mp3'])
 (OUT/'timing.json').write_text(json.dumps(timeline,indent=2))
 for c in captions:
  c['text']=c['text'].replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook').replace('ay dee','AD')
 (OUT/'captions.json').write_text(json.dumps(captions,indent=2))
 (OUT/'narration.txt').write_text('\n\n'.join(s[2].replace('ay dee','AD').replace('My Tail Log','MyTailLog').replace('My Flight Book','MyFlightBook') for s in SHOTS)+'\n')
 return timeline,captions,offset

def normalize_clean(clean):
 # A measured second pass prevents long quiet shots skewing one-pass loudness.
 probe=subprocess.run([FFMPEG,'-hide_banner','-threads','2','-i',str(clean),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
 stats=json.JSONDecoder().raw_decode(probe[probe.rindex('{'):])[0]
 norm=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=false"
 tmp=TMP/'normalized-clean.mp4'
 run(['-i',clean,'-af',norm,'-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-metadata','title=Coming soon: MyTailLog — paper to map | Voice: elevenlabs.io','-movflags','+faststart',tmp]);tmp.replace(clean)

def physical(i):
 src=HERE/'footage'/f'{"ABCD"[i]}.mp4'; out=TMP/f'physical-{i}.mp4'
 # Remove generated audio. Preserve framing; only final delivery is scaled to 1080.
 filt='scale=1080:1920:flags=lanczos,fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=1'
 if i in (1,2):
  # Dates are editorial labels, not text invented by the video model.
  labels=[('2005',4.6,6.8,.57,.38)] if i==1 else [('2010',1.4,3.6,.62,.38),('2018',3.0,5.2,.30,.40),('2020',5.0,7.2,.65,.43)]
  for label,start,end,x,y in labels:
   filt+=f",drawtext=fontfile={REPO/'apps/web/src/app/fonts/LibreFranklin.ttf'}:text='{label}':fontsize=44:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12:x=w*{x}:y=h*{y}+180*(t-{start}):enable='between(t,{start},{end})':alpha='min(1,(t-{start})*5)'"
 if i<3:
  run(['-i',src,'-vf',filt,'-t','8','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18',out])
 else:
  # D ends on AI-distorted UI: settle into the original untouched screenshot.
  # Source screenshot is tall: contain it at native ratio over the app yellow.
  fit='scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color='+YELLOW+",setsar=1,zoompan=z='1.06-0.06*min(on/128,1)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30"
  run(['-i',src,'-loop','1','-framerate','30','-i',HERE/'04-real-map-reference.png','-filter_complex',f'[0:v]{filt},trim=duration=4.3,setpts=PTS-STARTPTS[a];[1:v]{fit},trim=duration=4.3,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=0.6:offset=3.7,format=yuv420p[v]','-map','[v]','-t','8','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18',out])
 return out

def main():
 timeline,captions,total=narration(); clips=[]
 for i,s in enumerate(timeline):
  if i<4:p=physical(i)
  else:
   edit_scene(s['scene'],s['duration'],TMP);p=TMP/f'{s["scene"]+1:02d}.mp4'
  clips.append(p);print('Picture:',s['name'],flush=True)
 (TMP/'pictures.txt').write_text(''.join(f"file '{p}'\n" for p in clips))
 base=TMP/'picture.mp4';run(['-f','concat','-safe','0','-i',TMP/'pictures.txt','-c','copy',base])
 # Keep approved musical material; loop it to fit the new voice recording.
 clean=OUT/'mytaillog-paper-to-map-clean-1080x1920.mp4'
 run(['-i',base,'-i',OUT/'voiceover.wav','-stream_loop','-1','-i',REEL/'original-score.wav','-filter_complex',f'[1:a]highpass=f=80,asplit=2[voice][side];[2:a]volume=.24[music];[music][side]sidechaincompress=threshold=.03:ratio=6:attack=15:release=350[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=out:st={total-1}:d=1[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',total,'-movflags','+faststart','-metadata','title=Coming soon: MyTailLog — paper to map | Voice: elevenlabs.io',clean])
 normalize_clean(clean)
 header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Libre Franklin,40,&H00FFFFFF,&H00FFFFFF,&H001E1917,&H001E1917,-1,0,0,0,100,100,0,0,3,10,0,2,90,90,310,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
 events=[]
 for c in captions:
  line='\\N'.join(wrap(c['text'],40,860));events.append(f"Dialogue: 0,{ass_time(c['start'])},{ass_time(c['end'])},Default,,0,0,0,,{line}")
 ass=OUT/'captions.ass';ass.write_text(header+'\n'.join(events)+'\n')
 run(['-i',clean,'-vf',f'ass={ass}:fontsdir={REPO/"apps/web/src/app/fonts"}','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',OUT/'mytaillog-paper-to-map-captioned-1080x1920.mp4'])
 def stamp(t):
  n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
 (OUT/'narration.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))+'\n')
 assert all(0<=c['start']<c['end']<=total for c in captions)
 sheet=Image.new('RGB',(1350,960),INK)
 for i,s in enumerate(timeline):
  f=OUT/f'keyframe-{i+1:02}.jpg';run(['-ss',s['start']+s['duration']*.6,'-i',clean,'-frames:v','1',f]);im=Image.open(f);im.thumbnail((270,480));sheet.paste(im,((i%5)*270,(i//5)*480))
 sheet.save(OUT/'contact-sheet.jpg',quality=94)
 (OUT/'production.json').write_text(json.dumps({'duration_seconds':total,'dimensions':[1080,1920],'fps':30,'physical_source':'User-supplied Google Flow A–D; 720p/24fps converted for delivery','narration':'ElevenLabs Chris; updated script; AD synthesized as ay dee','music':'Approved original score, looped and ducked under speech','native_status':'Coming soon / preview','generated_audio_from_flow_used':False,'exact_app_handoff_at_seconds':28.3,'clip_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (HERE/'footage').glob('*.mp4')}},indent=2))
 print(f'Complete: {total:.2f}s',flush=True)
if __name__=='__main__':main()
