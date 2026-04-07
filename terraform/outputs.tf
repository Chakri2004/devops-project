output "public_ip" {
  value = aws_instance.devops_server.public_ip
}
output "elastic_ip" {
  value = aws_eip.devops_ip.public_ip
}