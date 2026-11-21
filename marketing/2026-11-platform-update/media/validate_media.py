"""Check deliverable dimensions, playable video/audio and narration/caption timing."""
from pathlib import Path
import ast,hashlib,json,re,subprocess
from PIL import Image
from build_media import ROOT,REEL,FFMPEG

def main():
 cards=sorted((ROOT/'carousel').glob('[0-9][0-9].jpg'));assert len(cards)==7
 for p in cards:assert Image.open(p).size==(1080,1350),p
 assert Image.open(ROOT/'facebook/platform-update-1200x630.jpg').size==(1200,630)
 assert Image.open(REEL/'cover-1080x1920.jpg').size==(1080,1920)
 timeline=json.loads((REEL/'timing.json').read_text());duration=sum(s['duration'] for s in timeline)
 captions=json.loads((REEL/'captions.json').read_text());assert all(0<=c['start']<c['end']<=duration for c in captions)
 assert max(c['end'] for c in captions)>duration-2
 voice=json.loads((REEL/'voice-production.json').read_text());assert voice['provider']=='ElevenLabs';assert voice['total_seconds']==duration
 assert 'coming soon' in (REEL/'narration.txt').read_text().lower()
 assert 'without a signal' not in (REEL/'narration.txt').read_text().lower()
 output={'duration_seconds':round(duration,3),'carousel_count':len(cards),'caption_count':len(captions),'videos':[]}
 for variant in ['clean','captioned']:
  p=REEL/f'mytaillog-platform-update-{variant}-1080x1920.mp4'
  probe=subprocess.run([FFMPEG,'-hide_banner','-i',str(p)],capture_output=True,text=True).stderr
  assert '1080x1920' in probe and '30 fps' in probe and 'Video: h264' in probe and 'Audio: aac' in probe,probe
  match=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',probe);h,m,s=map(float,match.groups());actual=h*3600+m*60+s;assert abs(actual-duration)<.12
  subprocess.run([FFMPEG,'-v','error','-i',str(p),'-f','null','-'],check=True)
  loud=subprocess.run([FFMPEG,'-hide_banner','-i',str(p),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
  stats=json.JSONDecoder().raw_decode(loud[loud.rindex('{'):])[0];assert -18<float(stats['input_i'])<-14;assert float(stats['input_tp'])<=-1.0
  output['videos'].append({'file':str(p.relative_to(ROOT)),'seconds':actual,'codec':'H.264/AAC','dimensions':[1080,1920],'fps':30,'integrated_lufs':stats['input_i'],'true_peak_dbtp':stats['input_tp']})
 for p in ROOT.glob('*.py'):ast.parse(p.read_text())
 output['checks']='passed';(ROOT/'verification.json').write_text(json.dumps(output,indent=2)+'\n')
 inventory=[]
 for p in sorted(ROOT.rglob('*')):
  if p.is_file() and '__pycache__' not in str(p) and p.name!='manifest.json':
   inventory.append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 (ROOT/'manifest.json').write_text(json.dumps(inventory,indent=2)+'\n');print(json.dumps(output,indent=2))
if __name__=='__main__':main()
