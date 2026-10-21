param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
if ($Root -notmatch '^[A-Za-z]:\\$') { exit 1 }
$drive = [System.IO.DriveInfo]::new($Root)
if ($drive.IsReady -and $drive.DriveType -eq [System.IO.DriveType]::Fixed) {
    [Console]::WriteLine('local')
} else {
    exit 1
}